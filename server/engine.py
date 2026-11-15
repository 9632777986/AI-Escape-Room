"""
Deterministic game engine. This module owns ALL game rules:
  * timer (server-side, counts active play only)
  * puzzle validation
  * evidence / inventory / room status
  * penalties, endings and scoring

The language model never touches this state. It receives a read-only,
redacted summary (see gm.py) and can only return text.
"""
from __future__ import annotations

import json
import random
import re
import time
from pathlib import Path
from typing import Any, Callable

from . import content as C

ROOM_PHASES = ("room1", "room2", "room3")
IDLE_CAP = 15.0           # a request after a long gap only adds this many seconds
HINTS_TOTAL = 3
STATIONS_R1 = ["statement", "desk", "bin", "cctv", "monitor", "laptop"]

SAVE_DIR = Path(__file__).resolve().parent.parent / "saves"


def hms_to_s(t: str) -> int:
    h, m, s = (int(x) for x in t.split(":"))
    return h * 3600 + m * 60 + s


def s_to_hms(n: int) -> str:
    n %= 86400
    return f"{n // 3600:02d}:{n % 3600 // 60:02d}:{n % 60:02d}"


class GameError(Exception):
    """A rule violation or invalid request. Safe to show to the player."""

    def __init__(self, msg: str, code: str = "invalid"):
        super().__init__(msg)
        self.msg, self.code = msg, code


class Game:
    def __init__(self, sid: str, now: Callable[[], float] = time.time, persist: bool = True):
        self.sid = sid
        self._now = now
        self.persist = persist
        self.reset()

    # ------------------------------------------------------------ lifecycle
    def reset(self):
        self.phase = "title"
        self.room = 1
        self.unlocked = {1: True, 2: False, 3: False}
        self.started = False
        self.elapsed = 0.0
        self.penalty = 0
        self.last_seen = self._now()
        self.viewed: set[str] = set()
        self.stations: set[str] = set()
        self.evidence: list[str] = []
        self.collected_at: dict[str, int] = {}
        self.hints_used = 0
        self.hint_level: dict[str, int] = {}
        self.wrong = 0
        self.keypad_fails = 0
        self.lock_until = 0.0
        self.flags: dict[str, Any] = {}
        self.header_flags: dict[str, list[int]] = {}
        self.links: list[list[str]] = []
        self.board_invalid = 0
        self.notes: list[str] = []          # order/quality notes shown in the report
        self.gm_log: list[dict] = []
        self.injections = 0
        self.end: dict | None = None
        self.log_flagged_tp = 0

    def to_dict(self) -> dict:
        return {
            "sid": self.sid, "phase": self.phase, "room": self.room,
            "unlocked": {str(k): v for k, v in self.unlocked.items()},
            "started": self.started, "elapsed": self.elapsed, "penalty": self.penalty,
            "viewed": sorted(self.viewed), "stations": sorted(self.stations),
            "evidence": self.evidence, "collected_at": self.collected_at,
            "hints_used": self.hints_used, "hint_level": self.hint_level,
            "wrong": self.wrong, "keypad_fails": self.keypad_fails,
            "flags": self.flags, "links": self.links, "board_invalid": self.board_invalid,
            "notes": self.notes, "injections": self.injections, "end": self.end,
            "header_flags": self.header_flags,
        }

    def load_dict(self, d: dict):
        self.phase = d["phase"]; self.room = d["room"]
        self.unlocked = {int(k): v for k, v in d["unlocked"].items()}
        self.started = d["started"]; self.elapsed = d["elapsed"]; self.penalty = d["penalty"]
        self.viewed = set(d["viewed"]); self.stations = set(d["stations"])
        self.evidence = d["evidence"]; self.collected_at = d["collected_at"]
        self.hints_used = d["hints_used"]; self.hint_level = d["hint_level"]
        self.wrong = d["wrong"]; self.keypad_fails = d["keypad_fails"]
        self.flags = d["flags"]; self.links = d["links"]; self.board_invalid = d["board_invalid"]
        self.notes = d["notes"]; self.injections = d.get("injections", 0); self.end = d["end"]
        self.header_flags = d.get("header_flags", {})
        self.last_seen = self._now()

    def save(self):
        if not self.persist:
            return
        try:
            SAVE_DIR.mkdir(exist_ok=True)
            (SAVE_DIR / f"{re.sub(r'[^A-Za-z0-9_-]', '', self.sid)[:64]}.json").write_text(json.dumps(self.to_dict()))
        except OSError:
            pass

    # ------------------------------------------------------------ timer
    @property
    def playing(self) -> bool:
        return self.started and self.phase in ROOM_PHASES

    def tick(self):
        now = self._now()
        if self.playing:
            self.elapsed += max(0.0, min(now - self.last_seen, IDLE_CAP))
            if self.time_left() <= 0:
                self._finish_fail("time")
        self.last_seen = now

    def time_left(self) -> int:
        return max(0, int(C.DURATION - self.elapsed - self.penalty))

    def add_penalty(self, secs: int, events: list | None = None, why: str = ""):
        self.penalty += secs
        if events is not None:
            events.append({"type": "penalty", "secs": secs, "why": why})
        if self.playing and self.time_left() <= 0:
            self._finish_fail("time")

    # ------------------------------------------------------------ public view
    def objectives(self) -> list[dict]:
        f, v = self.flags, self.viewed
        if self.room == 1:
            return [
                {"id": "o1", "text": f"Search the office ({len(self.stations & set(STATIONS_R1))}/6 stations)",
                 "done": len(self.stations & set(STATIONS_R1)) >= 6},
                {"id": "o2", "text": "Find the handwritten recovery note", "done": "obj:note" in v},
                {"id": "o3", "text": "Read the console session counters", "done": "console:summary" in v},
                {"id": "o4", "text": "Rebuild the shredded sentence in the bin", "done": "bin:solved" in v},
                {"id": "o5", "text": "Unlock the archive from the console", "done": bool(f.get("archive_unlocked"))},
                {"id": "o6", "text": "Reach the forensics lab", "done": self.unlocked[2]},
            ]
        if self.room == 2:
            return [
                {"id": "p1", "text": "Isolate the anomalous log rows", "done": bool(f.get("r2_logs"))},
                {"id": "p2", "text": "Match the device fingerprint", "done": bool(f.get("r2_fingerprint"))},
                {"id": "p3", "text": "Find the abnormal network hop", "done": bool(f.get("r2_route"))},
                {"id": "p4", "text": "Optional: sync the CCTV clock with the logs", "done": bool(f.get("r2_clock"))},
                {"id": "p5", "text": "Enter the incident room", "done": self.unlocked[3]},
            ]
        return [
            {"id": "q1", "text": f"Connect the evidence ({self._valid_links()}/{C.BOARD_MIN_LINKS} links)", "done": bool(f.get("r3_board"))},
            {"id": "q2", "text": "Order the incident timeline", "done": bool(f.get("r3_timeline"))},
            {"id": "q3", "text": "Separate supported findings from assumptions", "done": bool(f.get("r3_findings"))},
            {"id": "q4", "text": "Choose the containment plan", "done": self.phase == "success"},
        ]

    def _valid_links(self) -> int:
        return len(self.links)

    def public(self) -> dict:
        ev = []
        for eid in self.evidence:
            t = C.EVIDENCE[eid]
            ev.append({"id": eid, "title": t[0], "room": t[1], "kind": t[2], "text": t[3]})
        return {
            "phase": self.phase, "room": self.room, "started": self.started,
            "unlocked": {str(k): v for k, v in self.unlocked.items()},
            "time_left": self.time_left(), "duration": C.DURATION,
            "hints_left": HINTS_TOTAL - self.hints_used,
            "evidence": ev, "objectives": self.objectives(),
            "flags": {k: bool(v) for k, v in self.flags.items()},
            "stations": sorted(self.stations), "wrong": self.wrong,
            "lock": max(0, int(self.lock_until - self._now())),
            "links": self.links, "end": self.end,
        }

    # ------------------------------------------------------------ dispatch
    def act(self, name: str, body: dict | None = None) -> dict:
        body = body if isinstance(body, dict) else {}
        self.tick()
        events: list[dict] = []
        try:
            handler = getattr(self, f"a_{name}", None) if re.fullmatch(r"[a-z_]{1,32}", str(name)) else None
            if handler is None:
                raise GameError("Unknown action.", "unknown")
            if self.phase in ("success", "failed") and name not in ("new", "state", "gm"):
                raise GameError("The mission is over.", "over")
            out = handler(body, events) or {}
        except GameError as e:
            out = {"ok": False, "msg": e.msg, "code": e.code}
        except (TypeError, ValueError, KeyError, AttributeError, IndexError):
            # malformed input of the wrong type: reject cleanly, never crash the server
            out = {"ok": False, "msg": "Invalid request.", "code": "bad"}
        out.setdefault("ok", True)
        out["events"] = events
        out["state"] = self.public()
        self.save()
        return out

    def _need_room(self, n: int):
        if not self.started or self.phase not in ROOM_PHASES:
            raise GameError("The investigation has not started.", "locked")
        if not self.unlocked.get(n):
            raise GameError("That area is still locked.", "locked")
        if self.room != n:
            raise GameError("You are not in that room.", "locked")

    # ------------------------------------------------------------ flow
    def a_state(self, b, ev):
        return {}

    def a_new(self, b, ev):
        self.reset()
        return {}

    def a_phase(self, b, ev):
        to = b.get("to")
        order = {"title": 0, "intro": 1, "briefing": 2}
        if to not in order:
            raise GameError("Bad phase.")
        if self.started:
            raise GameError("Mission already running.")
        self.phase = to
        return {}

    def a_begin(self, b, ev):
        if self.started:
            raise GameError("Already running.")
        self.started = True
        self.phase = "room1"
        self.room = 1
        self.elapsed = 0.0
        self.last_seen = self._now()
        return {}

    def a_travel(self, b, ev):
        to = int(b.get("to", 0))
        if to not in (1, 2, 3) or not self.unlocked.get(to):
            raise GameError("That area is locked.", "locked")
        if not self.playing:
            raise GameError("Not in play.")
        self.room = to
        self.phase = f"room{to}"
        return {"room": to}

    # ------------------------------------------------------------ evidence
    def a_collect(self, b, ev):
        eid = b.get("id")
        if eid not in C.EVIDENCE:
            raise GameError("Unknown evidence.")
        if eid in self.evidence:
            return {"msg": "Already in your inventory.", "dup": True}
        need = C.EVIDENCE[eid][4]
        if need not in self.viewed:
            raise GameError("You have not found that yet.", "notfound")
        self._add_evidence(eid, ev)
        return {"msg": f"Evidence added: {C.EVIDENCE[eid][0]}"}

    def _add_evidence(self, eid: str, ev: list):
        if eid not in self.evidence:
            self.evidence.append(eid)
            self.collected_at[eid] = int(self.elapsed)
            ev.append({"type": "discover", "id": eid, "title": C.EVIDENCE[eid][0]})

    # ------------------------------------------------------------ ROOM 1
    def a_interact(self, b, ev):
        self._need_room(1)
        tgt = b.get("target")
        if tgt not in STATIONS_R1:
            raise GameError("Nothing to interact with.")
        self.stations.add(tgt)
        if tgt == "statement":
            self.viewed.add("obj:statement")
            return {"statement": C.STATEMENT}
        if tgt == "desk":
            return {"blotter": "obj:note" in self.viewed, "drawer": "obj:slip" in self.viewed,
                    "pad": "obj:pad" in self.viewed}
        if tgt == "bin":
            strips = list(C.BIN_STRIPS)
            random.Random(7).shuffle(strips)
            out = {"strips": strips, "solved": "bin:solved" in self.viewed}
            if out["solved"]:
                out["text"] = "Failed attempts first. Files opened second."
                out["scrap"] = C.BIN_DECOY
            return out
        if tgt == "cctv":
            marked = "cctv:figure" in self.viewed
            # The answer window and the motion log are only sent once the player has found the frame.
            cam = {k: C.CCTV[k] for k in ("camera", "start", "end")}
            if marked:
                cam["events"] = C.CCTV["events"]
            return {"cctv": cam, "marked": marked}
        if tgt == "monitor":
            return {"apps": ["mail", "console"], "archive": bool(self.flags.get("archive_unlocked"))}
        if tgt == "laptop":
            return {"apps": ["mail"], "box": "quarantine"}
        return {}

    def a_desk_item(self, b, ev):
        self._need_room(1)
        item = b.get("item")
        if item == "blotter":
            self.viewed.add("obj:note")
            return {"note": "19 _ _ 4", "msg": "A handwritten note is wedged under the blotter."}
        if item == "drawer":
            self.viewed.add("obj:slip")
            return {"slip": "LOANER CHECKOUT\nUnit: LT-77\nDesk: C-17 (contractor)\nOut: Nov 6\nReturn signature: ________"}
        if item == "pad":
            self.viewed.add("obj:pad")
            return {"pad": "LT-77 -> who has it?  ask IT"}
        raise GameError("Nothing there.")

    def a_bin_submit(self, b, ev):
        self._need_room(1)
        order = b.get("order")
        if "bin:solved" in self.viewed:
            return {"solved": True}
        if not isinstance(order, list) or order != C.BIN_ORDER:
            self.wrong += 1
            return {"ok": False, "solved": False, "msg": "The strips don't form a sentence yet."}
        self.viewed.add("bin:solved")
        return {"solved": True, "text": "Failed attempts first. Files opened second.", "scrap": C.BIN_DECOY,
                "msg": "The strips form a sentence."}

    def a_cctv_mark(self, b, ev):
        self._need_room(1)
        try:
            t = hms_to_s(str(b.get("t")))
        except Exception:
            raise GameError("Bad timestamp.")
        a, z = (hms_to_s(x) for x in C.CCTV["figure_window"])
        if not a <= t <= z:
            return {"ok": False, "msg": "Nothing of interest in this frame."}
        self.viewed.add("cctv:figure")
        return {"marked": True, "t": s_to_hms(t), "msg": "Frame marked."}

    # ---- mail
    def _mailbox(self, box):
        if box == "exec":
            self.stations.add("monitor")
        elif box == "quarantine":
            self.stations.add("laptop")
        else:
            raise GameError("Unknown mailbox.")
        return [m for m in C.MAIL if m["box"] == box]

    def _mail_meta(self, m, hit=None):
        d = {"id": m["id"], "from": m["from"], "addr": m["addr"], "date": m["date"],
             "subject": m["subject"], "folder": m["folder"],
             "unread": m["unread"] and f"mail:{m['id']}" not in self.viewed,
             "attach": bool(m["attach"])}
        if hit:
            d["hit"] = hit
        return d

    def a_mail_list(self, b, ev):
        self._need_room(1)
        box = self._mailbox(b.get("box"))
        return {"mails": [self._mail_meta(m) for m in box]}

    def a_mail_search(self, b, ev):
        self._need_room(1)
        box = self._mailbox(b.get("box"))
        q = str(b.get("q", "")).strip().lower()[:80]
        if not q:
            return {"mails": [self._mail_meta(m) for m in box]}
        out = []
        for m in box:
            hay = {"subject": m["subject"], "sender": m["from"] + " " + m["addr"], "body": m["body"]}
            for where, text in hay.items():
                if q in text.lower():
                    out.append(self._mail_meta(m, where))
                    break
        return {"mails": out, "q": q}

    def a_mail_open(self, b, ev):
        self._need_room(1)
        box = self._mailbox(b.get("box"))
        m = next((x for x in box if x["id"] == b.get("id")), None)
        if not m:
            raise GameError("No such message.")
        self.viewed.add(f"mail:{m['id']}")
        out = self._mail_meta(m)
        out.update({"to": m["to"], "body": m["body"], "attach": m["attach"],
                    "headers": [{"i": i, "k": k, "v": v} for i, (k, v, _bad) in enumerate(m["headers"])],
                    "evidence": m["evidence"] if m["evidence"] and m["evidence"] != "ev_spoof" else None})
        if m["evidence"] == "ev_spoof":
            out["evidence"] = "ev_spoof" if "header:verified" in self.viewed else None
            out["needs_header_check"] = "header:verified" not in self.viewed
        return out

    def a_header_submit(self, b, ev):
        self._need_room(1)
        mid = b.get("id")
        m = next((x for x in C.MAIL if x["id"] == mid), None)
        if not m or f"mail:{mid}" not in self.viewed:
            raise GameError("Open the message first.")
        flagged = b.get("flags")
        if not isinstance(flagged, list) or not all(isinstance(i, int) for i in flagged):
            raise GameError("Bad flags.")
        n = len(m["headers"])
        flagged = {i for i in flagged if 0 <= i < n}
        tp = sum(1 for i in flagged if m["headers"][i][2])
        fp = len(flagged) - tp
        if mid != C.HEADER_TARGET:
            return {"tp": tp, "fp": fp, "msg": "Noted. Nothing here links to the incident.", "relevant": False}
        if tp >= C.HEADER_TRUE_MIN and fp <= C.HEADER_FP_MAX:
            self.viewed.add("header:verified")
            return {"tp": tp, "fp": fp, "verified": True, "evidence": "ev_spoof",
                    "msg": "Header check passed. The display name is not identity evidence."}
        self.wrong += 1
        return {"ok": False, "tp": tp, "fp": fp, "verified": False,
                "msg": f"{tp} suspicious, {fp} normal lines flagged. Re-read the routing and authentication lines."}

    # ---- console
    def a_console(self, b, ev):
        self._need_room(1)
        self.stations.add("monitor")
        raw = str(b.get("cmd", ""))[:120].strip()
        parts = raw.split()
        cmd = parts[0].lower() if parts else ""
        arg = parts[1] if len(parts) > 1 else ""
        unlocked = bool(self.flags.get("archive_unlocked"))
        L = []
        if cmd == "":
            return {"lines": []}
        if cmd == "help":
            L = ["COMMANDS", "  summary    incident-window activity counters", "  archive    show archive lock status",
                 "  unlock     open the recovery keypad (or: unlock <key>)",
                 "  sessions   active sessions (after archive recovery)",
                 "  devices    device inventory (after archive recovery)",
                 "  whoami | date | clear"]
        elif cmd == "summary":
            self.viewed.add("console:summary")
            L = ["SESSION SUMMARY  21:50-22:30  FRI 13 NOV 2026",
                 f"  Failed sign-ins ........ {C.COUNTERS['failed']}",
                 f"  Files accessed ......... {C.COUNTERS['files']}",
                 "  Exports ................ 1", "Counters recorded. Pin them from the evidence tray."]
            return {"lines": L, "evidence": "ev_counters"}
        elif cmd == "archive":
            L = ["ARCHIVE exec.archive.lock", "  state: " + ("DECRYPTED" if unlocked else "LOCKED"),
                 "  key:   5 digits" if not unlocked else "  RECOVERY_SEQUENCE.TXT available: type 'sessions'"]
        elif cmd == "unlock":
            if unlocked:
                L = ["Archive is already decrypted."]
            elif arg:
                return self._try_key(arg, ev)
            else:
                return {"lines": ["Opening recovery keypad..."], "keypad": True}
        elif cmd in ("sessions", "devices"):
            if not unlocked:
                L = ["ACCESS RESTRICTED: decrypt the archive first."]
            elif cmd == "sessions":
                self.viewed.add("console:unlocked")
                L = ["ACTIVE SESSIONS", "  alice.huang  LT-77  relay-04.external.example  since 22:04:51  [!] unregistered device"]
            else:
                L = ["DEVICE INVENTORY (excerpt)", "  LT-12  alice.huang (registered)", "  LT-77  loaner pool, unassigned", "  WS-22  m.chen (registered)"]
        elif cmd == "whoami":
            L = ["investigator@exec-console"]
        elif cmd == "date":
            L = ["Fri Nov 13 22:41:07 CET 2026"]
        elif cmd == "clear":
            return {"clear": True, "lines": []}
        else:
            L = [f"command not found: {cmd[:24]}. Type 'help'."]
        return {"lines": L}

    def a_keypad(self, b, ev):
        self._need_room(1)
        code = str(b.get("code", ""))
        return self._try_key(code, ev)

    def _try_key(self, code: str, ev: list):
        now = self._now()
        if self.flags.get("archive_unlocked"):
            return {"lines": ["Archive is already decrypted."], "unlocked": True}
        if now < self.lock_until:
            left = int(self.lock_until - now) + 1
            return {"ok": False, "lines": [f"KEYPAD LOCKED. Retry in {left}s."], "locked": left,
                    "msg": f"Keypad locked for {left}s."}
        if not re.fullmatch(r"\d{5}", code):
            return {"ok": False, "lines": ["Key must be exactly 5 digits."], "msg": "Key must be 5 digits."}
        if code != C.RECOVERY_KEY:
            self.wrong += 1
            self.keypad_fails += 1
            msg = "ACCESS DENIED."
            if self.keypad_fails % 3 == 0:
                self.lock_until = now + 30
                self.add_penalty(45, ev, "Keypad lockout")
                msg = "ACCESS DENIED. Three failures: keypad locked for 30s."
            ev.append({"type": "error"})
            return {"ok": False, "lines": [msg], "msg": msg, "locked": 30 if self.keypad_fails % 3 == 0 else 0}
        self.flags["archive_unlocked"] = True
        self.viewed.add("console:unlocked")
        self.unlocked[2] = True
        ev.append({"type": "unlock"})
        return {"unlocked": True, "evidence": "ev_recovery",
                "lines": ["KEY ACCEPTED. Decrypting exec.archive ...", "", "RECOVERY_SEQUENCE.TXT",
                          "  Unknown device LT-77 held an active session during the export window.",
                          "  Forensics lab access granted.", "Type 'sessions' for details."],
                "msg": "Archive decrypted. The forensics lab door is open."}

    # ------------------------------------------------------------ ROOM 2
    def a_logs(self, b, ev):
        self._need_room(2)
        return {"rows": C.LOGS, "flagged_min": C.LOG_MIN_TP}

    def a_logs_submit(self, b, ev):
        self._need_room(2)
        ids = b.get("ids")
        if not isinstance(ids, list):
            raise GameError("Bad request.")
        known = {r["id"] for r in C.LOGS}
        s = {i for i in ids if isinstance(i, str) and i in known} - C.LOG_NEUTRAL
        tp, fp = len(s & C.LOG_TRUE), len(s - C.LOG_TRUE)
        if self.flags.get("r2_logs"):
            return {"passed": True, "tp": tp, "fp": fp}
        if tp >= C.LOG_MIN_TP and fp <= C.LOG_MAX_FP:
            self.flags["r2_logs"] = True
            self.viewed.add("r2:logs")
            self._add_evidence("ev_logs", ev)
            self._check_unlock3(ev)
            return {"passed": True, "tp": tp, "fp": fp, "msg": "Anomaly set confirmed."}
        self.wrong += 1
        self.add_penalty(C.LOG_PENALTY, ev, "Wrong anomaly set")
        ev.append({"type": "error"})
        return {"ok": False, "passed": False, "tp": tp, "fp": fp,
                "msg": f"{tp} of the flagged rows look hostile and {fp} look normal. Some hostile rows are still unflagged."
                       if tp < C.LOG_MIN_TP else f"{fp} of your flagged rows are ordinary activity."}

    def a_fingerprint(self, b, ev):
        self._need_room(2)
        return {"observed_keys": list(C.FP_OBSERVED.keys()),
                "assets": {k: {"assigned": v["assigned"]} for k, v in C.FP_ASSETS.items()}}

    def a_fingerprint_compare(self, b, ev):
        self._need_room(2)
        asset = b.get("asset")
        if asset not in C.FP_ASSETS:
            raise GameError("Unknown asset.")
        a = C.FP_ASSETS[asset]
        rows = [{"key": k, "observed": C.FP_OBSERVED[k], "asset": a[k], "match": C.FP_OBSERVED[k] == a[k]}
                for k in C.FP_OBSERVED]
        matched = all(r["match"] for r in rows)
        out = {"asset": asset, "rows": rows, "assigned": a["assigned"], "matched": matched}
        if matched and asset == C.FP_TARGET:
            if not self.flags.get("r2_fingerprint"):
                self.flags["r2_fingerprint"] = True
                self.viewed.add("r2:fingerprint")
                self._add_evidence("ev_fingerprint", ev)
                self._check_unlock3(ev)
            out["msg"] = "All four attributes match the loaner LT-77. It is not Alice's registered laptop."
        else:
            out["msg"] = "Attributes do not line up."
            ev.append({"type": "error"})
        return out

    def a_routes(self, b, ev):
        self._need_room(2)
        return {"routes": {k: {"label": v["label"], "hops": v["hops"]} for k, v in C.ROUTES.items()}}

    def a_route_submit(self, b, ev):
        self._need_room(2)
        trace, hop = b.get("trace"), b.get("hop")
        if self.flags.get("r2_route"):
            return {"passed": True}
        if (trace, hop) == C.ROUTE_ANSWER:
            self.flags["r2_route"] = True
            self.viewed.add("r2:route")
            self._add_evidence("ev_route", ev)
            self._check_unlock3(ev)
            return {"passed": True, "msg": "relay-04.external.example is not corporate infrastructure."}
        self.wrong += 1
        self.add_penalty(C.ROUTE_PENALTY, ev, "Wrong route finding")
        ev.append({"type": "error"})
        known = trace in C.ROUTES
        return {"ok": False, "passed": False,
                "msg": "That hop is expected for that sign-in." if known else "Choose a trace first."}

    def a_clock_info(self, b, ev):
        self._need_room(2)
        if "cctv:figure" not in self.viewed:
            raise GameError("You have not reviewed any corridor footage yet. Check the CCTV screen in the office.", "notfound")
        near = [r for r in C.LOGS if "22:03:00" <= r["time"] <= "22:06:00"]
        return {"cam_time": C.CCTV_RAW, "log": near, "done": bool(self.flags.get("r2_clock"))}

    def a_clock_sync(self, b, ev):
        self._need_room(2)
        if "cctv:figure" not in self.viewed:
            raise GameError("No footage reviewed.", "notfound")
        try:
            off = int(b.get("offset"))
        except (TypeError, ValueError):
            raise GameError("Bad offset.")
        if self.flags.get("r2_clock"):
            return {"passed": True, "corrected": C.CCTV_CORRECTED}
        if off == C.CCTV_OFFSET:
            self.flags["r2_clock"] = True
            self.viewed.add("r2:clock")
            self._add_evidence("ev_clock", ev)
            return {"passed": True, "corrected": C.CCTV_CORRECTED,
                    "msg": "Clocks aligned: the door opens in the logs at 22:04:47."}
        self.wrong += 1
        self.add_penalty(C.CLOCK_PENALTY, ev, "Clock offset mismatch")
        ev.append({"type": "error"})
        return {"ok": False, "passed": False, "corrected": s_to_hms(hms_to_s(C.CCTV_RAW) + off),
                "msg": "No log event lines up with that corrected time."}

    def _check_unlock3(self, ev):
        if all(self.flags.get(k) for k in ("r2_logs", "r2_fingerprint", "r2_route")) and not self.unlocked[3]:
            self.unlocked[3] = True
            ev.append({"type": "unlock"})

    # ------------------------------------------------------------ ROOM 3
    def a_board(self, b, ev):
        self._need_room(3)
        nodes = [{"id": e, "title": C.EVIDENCE[e][0], "kind": C.EVIDENCE[e][2], "room": C.EVIDENCE[e][1]}
                 for e in self.evidence if C.EVIDENCE[e][1] <= 2]
        return {"nodes": nodes, "links": self.links, "need": C.BOARD_MIN_LINKS}

    def a_board_link(self, b, ev):
        self._need_room(3)
        x, y = b.get("a"), b.get("b")
        if x == y or x not in self.evidence or y not in self.evidence:
            raise GameError("You can only connect evidence you hold.")
        pair = frozenset((x, y))
        if [x, y] in self.links or [y, x] in self.links:
            return {"valid": True, "dup": True, "msg": "Already connected."}
        if pair in C.BOARD_LINKS:
            self.links.append([x, y])
            done = len(self.links) >= C.BOARD_MIN_LINKS
            if done and not self.flags.get("r3_board"):
                self.flags["r3_board"] = True
                ev.append({"type": "unlock"})
            return {"valid": True, "msg": C.BOARD_LINKS[pair], "count": len(self.links), "done": done}
        self.board_invalid += 1
        self.add_penalty(C.BOARD_LINK_PENALTY, ev, "Meaningless link")
        ev.append({"type": "error"})
        return {"ok": True, "valid": False, "msg": "These two pieces don't support each other.",
                "count": len(self.links)}

    def a_timeline(self, b, ev):
        self._need_room(3)
        cards = list(C.TIMELINE_CARDS)
        random.Random(11).shuffle(cards)
        return {"cards": cards, "slots": len(C.TIMELINE_ORDER), "done": bool(self.flags.get("r3_timeline"))}

    def a_timeline_submit(self, b, ev):
        self._need_room(3)
        order = b.get("order")
        if self.flags.get("r3_timeline"):
            return {"passed": True}
        if not isinstance(order, list):
            raise GameError("Bad request.")
        if order == C.TIMELINE_ORDER:
            self.flags["r3_timeline"] = True
            self.viewed.add("r3:timeline")
            self._add_evidence("ev_timeline", ev)
            return {"passed": True, "msg": "Timeline verified."}
        wrong_cards = [c for c in order if c not in C.TIMELINE_ORDER]
        pos_ok = sum(1 for i, c in enumerate(order) if i < len(C.TIMELINE_ORDER) and c == C.TIMELINE_ORDER[i])
        self.wrong += 1
        self.add_penalty(C.TIMELINE_PENALTY, ev, "Wrong timeline")
        ev.append({"type": "error"})
        msg = f"{pos_ok} of 6 events are in the right place."
        if wrong_cards:
            msg += " Some cards don't belong to this incident."
        return {"ok": False, "passed": False, "correct": pos_ok, "msg": msg}

    def a_findings(self, b, ev):
        self._need_room(3)
        return {"items": [{"id": f["id"], "text": f["text"]} for f in C.FINDINGS],
                "done": bool(self.flags.get("r3_findings"))}

    def a_findings_submit(self, b, ev):
        self._need_room(3)
        ans = b.get("answers")
        if self.flags.get("r3_findings"):
            return {"passed": True}
        if not isinstance(ans, dict):
            raise GameError("Bad request.")
        bad = 0
        for f in C.FINDINGS:
            if ans.get(f["id"]) is not f["supported"]:
                bad += 1
        if bad == 0:
            self.flags["r3_findings"] = True
            self.viewed.add("r3:findings")
            self._add_evidence("ev_findings", ev)
            return {"passed": True, "msg": "Findings accepted. Account activity is not human identity."}
        self.wrong += 1
        self.add_penalty(C.FINDINGS_PENALTY, ev, "Unsupported conclusions")
        ev.append({"type": "error"})
        return {"ok": False, "passed": False, "bad": bad,
                "msg": f"{bad} classification{'s' if bad != 1 else ''} not supported by the evidence."}

    def a_actions(self, b, ev):
        self._need_room(3)
        ready = all(self.flags.get(k) for k in ("r3_board", "r3_timeline", "r3_findings"))
        return {"ready": ready,
                "actions": [{"id": k, "label": v["label"]} for k, v in C.ACTIONS.items()]}

    def a_response_submit(self, b, ev):
        self._need_room(3)
        if not all(self.flags.get(k) for k in ("r3_board", "r3_timeline", "r3_findings")):
            raise GameError("Finish the board, the timeline and the findings first.", "notready")
        plan = b.get("plan")
        if not isinstance(plan, list) or not plan or len(set(plan)) != len(plan) or any(p not in C.ACTIONS for p in plan):
            raise GameError("Choose actions for your plan.")
        crit = [p for p in plan if C.ACTIONS[p]["kind"] == "critical"]
        required = [k for k, v in C.ACTIONS.items() if v["kind"] == "required"]
        missing = [r for r in required if r not in plan]
        steps = []
        for p in plan:
            kind = C.ACTIONS[p]["kind"]
            steps.append({"id": p, "label": C.ACTIONS[p]["label"], "kind": kind,
                          "why": C.ACTIONS[p].get("why", "")})
        if crit:
            self._finish_fail(crit[0], steps)
            return {"outcome": "critical", "steps": steps, "cause": crit[0]}
        if missing:
            self.wrong += 1
            self.add_penalty(C.RESPONSE_REJECT_PENALTY, ev, "Containment gaps")
            ev.append({"type": "error"})
            gaps = {"a_preserve": "Evidence was not preserved.", "a_revoke": "The attacker's session is still open.",
                    "a_isolate": "LT-77 is still connected to the network.",
                    "a_reset": "The compromised credentials are still valid.",
                    "a_notify": "No one responsible knows about the incident."}
            return {"ok": False, "outcome": "rejected", "steps": steps,
                    "gaps": [gaps[m] for m in missing],
                    "msg": "The plan leaves gaps. The response lead sends it back."}
        notes = []
        idx = {p: i for i, p in enumerate(plan)}
        for (late, early), text in C.ACTION_ORDER_NOTES.items():
            if late in idx and early in idx and idx[late] < idx[early]:
                notes.append(text)
        self.notes = notes
        self._finish_success(plan, steps)
        return {"outcome": "success", "steps": steps, "notes": notes}

    # ------------------------------------------------------------ endings
    def _score(self, plan: list[str]) -> dict:
        left = self.time_left()
        s = 5000 + left - 300 * self.hints_used - 150 * self.wrong
        s -= 400 * len(self.notes)
        if "a_restrict" in plan:
            s += 500
        grade = "S" if s >= 6000 else "A" if s >= 5200 else "B" if s >= 4400 else "C"
        containment = 100 - 15 * len(self.notes)
        evidence = 100 - (25 if any("snapshot" in n for n in self.notes) else 0)
        trust = 100 - 10 * min(self.wrong, 5)
        recovery = {"Containment": max(0, containment) + (0 if "a_restrict" in plan else -10),
                    "Evidence integrity": max(0, evidence),
                    "Stakeholder trust": max(0, trust)}
        return {"score": max(0, s), "grade": grade, "recovery": {k: max(0, min(100, v)) for k, v in recovery.items()}}

    def _finish_success(self, plan, steps):
        self.phase = "success"
        sc = self._score(plan)
        self.end = {"type": "success", **sc, "time_left": self.time_left(), "hints": self.hints_used,
                    "wrong": self.wrong, "evidence": len(self.evidence), "steps": steps, "notes": self.notes}

    def _finish_fail(self, cause: str, steps: list | None = None):
        if self.phase == "failed":
            return
        self.phase = "failed"
        self.end = {"type": "failed", "cause": cause, "steps": steps or [],
                    "evidence": len(self.evidence), "wrong": self.wrong}

    # ------------------------------------------------------------ hints
    def _hint_key(self) -> str | None:
        f, v = self.flags, self.viewed
        if self.room == 1:
            if f.get("archive_unlocked"):
                return None
            if not ("obj:note" in v and "console:summary" in v and len(self.stations) >= 4):
                return "r1_search"
            return "r1_key"
        if self.room == 2:
            for k, h in (("r2_logs", "r2_logs"), ("r2_fingerprint", "r2_fingerprint"), ("r2_route", "r2_route")):
                if not f.get(k):
                    return h
            return None
        for k, h in (("r3_board", "r3_board"), ("r3_timeline", "r3_timeline"),
                     ("r3_findings", "r3_findings")):
            if not f.get(k):
                return h
        return "r3_response"

    def a_hint(self, b, ev):
        if not self.playing:
            raise GameError("Hints are available during the investigation.")
        if self.hints_used >= HINTS_TOTAL:
            raise GameError("No hints left.", "nohints")
        key = self._hint_key()
        if key is None:
            return {"msg": "NIGHTWATCH: Nothing more to ask here. Move on."}
        lvl = min(self.hint_level.get(key, 0), 2)
        self.hint_level[key] = lvl + 1
        self.hints_used += 1
        return {"hint": C.HINTS[key][lvl], "level": lvl + 1}

    # ------------------------------------------------------------ gm
    def a_gm(self, b, ev):
        from . import gm  # local import: keeps the engine free of LLM code
        text = str(b.get("text", ""))
        out = gm.ask(self, text)
        self.gm_log.append({"q": text[:200], "src": out.get("source"), "blocked": out.get("blocked", False)})
        self.gm_log = self.gm_log[-20:]
        return out

    # ------------------------------------------------------------ redacted view for the LLM
    def llm_context(self) -> dict:
        """What NIGHTWATCH may know. Contains no solutions and no unseen facts."""
        puzzle_items = {"ev_note", "ev_counters", "ev_fragments"}   # never expose: together they give the key
        return {
            "room": self.room,
            "minutes_left": self.time_left() // 60,
            "stations_visited": sorted(self.stations),
            "evidence_held": [C.EVIDENCE[e][0] for e in self.evidence],
            "known_facts": [C.EVIDENCE[e][3] for e in self.evidence if e not in puzzle_items],
            "hints_left": HINTS_TOTAL - self.hints_used,
            "objectives_open": [o["text"] for o in self.objectives() if not o["done"]],
        }
