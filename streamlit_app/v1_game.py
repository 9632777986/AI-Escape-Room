"""Version 1 game core (no Streamlit, no LLM): one room, six interactive objects, three clues, inventory,
a final escape challenge. The Game Master (Gemini) only NARRATES what this module decides.

Everything fictional: the people, accounts, devices and events are invented.
"""
from __future__ import annotations

import random
import re
from dataclasses import dataclass, field

from server import content as C

KEY = C.RECOVERY_KEY  # "19374" = 19 + failed(3) + files(7) + 4 ; defined here, never sent to the model

# ---------------------------------------------------------------- the room
OBJECTS = {
    "desk": {"name": "Executive desk", "icon": "🗄️", "alias": r"desk|drawer|blotter|notepad|legal pad|\bpad\b|pencil"},
    "bin": {"name": "Waste bin", "icon": "🗑️", "alias": r"\bbin\b|trash|waste|shred|strips?|rubbish"},
    "computer": {"name": "Computer", "icon": "🖥️", "alias": r"computer|monitor|terminal|console|\bpc\b|screen|workstation"},
    "cctv": {"name": "Corridor camera feed", "icon": "📹", "alias": r"cctv|camera|footage|surveillance|corridor"},
    "statement": {"name": "Framed statement", "icon": "🖼️", "alias": r"statement|frame|framed|wall|picture|poster"},
    "door": {"name": "Archive door keypad", "icon": "🔢", "alias": r"keypad|\bdoor\b|\block\b|\bexit\b|archive|\bsafe\b|panel"},
}

ITEMS = {
    "note": ("Handwritten note", "19 _ _ 4"),
    "sentence": ("Reassembled sentence", "Failed attempts first. Files opened second."),
    "counters": ("Console printout", f"Failed sign-ins: {C.COUNTERS['failed']}   Files accessed: {C.COUNTERS['files']}"),
    "slip": ("Loaner checkout slip", "Unit LT-77, desk C-17 (contractor), out Nov 6, return signature blank."),
}
CLUES = ("note", "sentence", "counters")          # the three clues the final lock depends on
ITEM_ALIAS = {
    "note": r"note|handwritten|paper scrap|scrap",
    "sentence": r"sentence|strips?|reassembled|tape",
    "counters": r"printout|counters?|summary|report|numbers",
    "slip": r"slip|checkout|loaner|ticket",
}

_strips = list(C.BIN_STRIPS)
random.Random(7).shuffle(_strips)
STRIP_VIEW = _strips                                              # shuffled order shown to the player (1-4)
BIN_SOLUTION = [next(i + 1 for i, s in enumerate(STRIP_VIEW) if s["id"] == sid) for sid in C.BIN_ORDER]   # strip numbers in reading order

SAFE_READS = {"look", "examine", "inventory", "help"}      # allowed even when the guard is suspicious (and the text is short)
READONLY = {"look", "examine", "inventory", "help", "hint_request", "unknown", "restart_note"}
MAX_TRIES_BEFORE_ALARM = 3

HINTS = [
    # (condition on game, text). First matching unseen-stage hint is shown. None of them contain digits of the key.
    (lambda g: "note" not in g.found, "Executive desks hide things. Try lifting the blotter on the desk."),
    (lambda g: not g.sentence_done, "The waste bin holds shredded strips of one sentence. Number them 1 to 4 and say how you would arrange them."),
    (lambda g: "counters" not in g.found, "The computer keeps a summary of the incident window. Try a console command called summary."),
    (lambda g: not set(CLUES) <= g.inventory, "You have found a clue, but you can only use what you carry. Try 'take' on each clue."),
    (lambda g: True, "The note gives the first two and last digits, the printout gives two numbers, the sentence gives their order. Put them together."),
]


@dataclass
class Result:
    kind: str
    ok: bool = True
    facts: list[str] = field(default_factory=list)   # what actually happened (the narrator may only describe these)
    display: str | None = None                       # verbatim clue/text shown to the player, never altered by the LLM
    win: bool = False


class RoomGame:
    def __init__(self):
        self.reset()

    def reset(self):
        self.found: set[str] = set()        # clues discovered by examining
        self.inventory: set[str] = set()
        self.looked: set[str] = set()       # objects examined
        self.sentence_done = False
        self.counters_seen = False
        self.wrong_code = 0
        self.wrong_order = 0
        self.moves = 0
        self.hints = 0
        self.escaped = False
        self.log: list[str] = []

    # ---------------------------------------------------------- views for UI / narrator
    def progress(self) -> dict:
        return {"clues_found": len([c for c in CLUES if c in self.found]), "clues_total": len(CLUES),
                "objects_seen": len(self.looked), "objects_total": len(OBJECTS)}

    def context(self) -> dict:
        """Redacted, read-only state for the model. Contains NO solution text."""
        return {
            "room": "Executive Office, floor 14 (fictional)",
            "objects": [o["name"] for o in OBJECTS.values()],
            "objects_examined": sorted(OBJECTS[o]["name"] for o in self.looked),
            "inventory": sorted(ITEMS[i][0] for i in self.inventory),
            "clues_found": self.progress()["clues_found"], "clues_total": len(CLUES),
            "moves": self.moves, "escaped": self.escaped,
        }

    # ---------------------------------------------------------- the single entry point
    def do(self, text: str) -> Result:
        low = re.sub(r"\s+", " ", text.lower()).strip()
        self.moves += 1
        r = self._dispatch(low)
        self.log.append(r.kind)
        return r

    def parse_kind(self, text: str) -> str:
        """Peek at the action kind without changing state (used by the guard to allow read-only actions)."""
        low = re.sub(r"\s+", " ", text.lower()).strip()
        snap = self.__dict__.copy()
        snap = {k: (set(v) if isinstance(v, set) else list(v) if isinstance(v, list) else v) for k, v in snap.items()}
        try:
            return self._dispatch(low).kind
        finally:
            self.__dict__.update(snap)

    # ---------------------------------------------------------- parsing + rules
    def _dispatch(self, low: str) -> Result:
        if not low:
            return Result("unknown", False, ["The player said nothing."])
        if self.escaped:
            return Result("look", True, ["The incident is closed. The player has escaped."])
        if re.fullmatch(r"(i|inv|inventory|bag|items?|pockets?|what (do i|am i) (have|carry\w*)|what have i got|my items)\??", low) or "inventory" in low:
            return self._inventory()
        if re.match(r"(restart|reset|quit|start over|new game)\b", low):
            return Result("restart_note", True, ["The player wants to restart; only the Restart button in the sidebar can do that."])
        if re.match(r"(hint|clue|stuck|i('| a)?m stuck|help me|any ideas|what (now|next|should i do))\b", low) or low in ("hint", "hints"):
            return self._hint()
        if re.match(r"(help|\?|commands?|how (do|to) (i )?play)\b", low):
            return Result("help", True, ["The player asked how to play."])
        if re.match(r"(look( around)?|where am i|room|survey|describe( the room)?)$", low):
            return self._look()

        digits = re.findall(r"(?<!\d)\d{5}(?!\d)", low)
        if digits:
            return self._try_code(digits[0])
        if re.search(r"\b(enter|type|input|key in|try|punch)\b.*\b(code|digits?|number|key|pin)\b", low) and re.search(r"\d", low):
            return Result("code_format", False, ["The keypad needs exactly five digits."])

        order = [int(d) for d in re.findall(r"[1-4]", low)]
        if re.search(r"\b(arrange|order|tape|reassemble|assemble|put|sort|combine|piece|sequence|glue|stick)\b", low) and re.search(r"\d", low):
            return self._arrange(order)

        if re.match(r"(take|grab|pick up|pocket|collect|keep|add)\b", low):
            return self._take(low)

        if re.search(r"\bsummary\b", low) and re.search(r"\b(run|type|command|console|computer|terminal|execute|enter|use)\b|^summary$", low):
            return self._console("summary")
        if re.match(r"(run|type|execute|command)\b", low):
            return self._console(re.sub(r"^(run|type|execute|command)\s+", "", low).strip())

        # specific desk layers first, then generic objects
        if re.search(r"blotter|note under|lift", low):
            return self._desk("blotter")
        if re.search(r"drawer|open the desk", low):
            return self._desk("drawer")
        if re.search(r"pencil|legal pad|notepad|\bpad\b", low):
            return self._desk("pad")
        for oid, o in OBJECTS.items():
            if re.search(o["alias"], low):
                return self._examine(oid)
        return Result("unknown", False, ["The player's words did not match any action or object in the room."])

    def _look(self) -> Result:
        return Result("look", True, ["The player surveys the room."],
                      display="Objects you can examine: " + ", ".join(f"{o['icon']} {o['name']}" for o in OBJECTS.values()))

    def _inventory(self) -> Result:
        if not self.inventory:
            return Result("inventory", True, ["The player's inventory is empty."], display="Inventory: (empty). Use 'take' on things you find.")
        lines = [f"• {ITEMS[i][0]}: {ITEMS[i][1]}" for i in ITEMS if i in self.inventory]
        return Result("inventory", True, ["The player checks the inventory."], display="Inventory:\n" + "\n".join(lines))

    def _hint(self) -> Result:
        self.hints += 1
        for cond, text in HINTS:
            if cond(self):
                return Result("hint_request", True, ["The player asked for a hint."], display=f"Hint {self.hints}: {text}")
        return Result("hint_request", True, [])

    def _examine(self, oid: str) -> Result:
        self.looked.add(oid)
        name = OBJECTS[oid]["name"]
        if oid == "desk":
            return Result("examine", True, [f"The player looks over the {name}: a blotter, a drawer and a legal pad."],
                          display="The desk has three things worth a closer look: the **blotter**, the **drawer**, the **legal pad**.")
        if oid == "bin":
            lines = [f"{i + 1}. “{s['text']}”" for i, s in enumerate(STRIP_VIEW)]
            if self.sentence_done:
                return Result("examine", True, ["The strips were already taped together."], display="Taped sentence: “Failed attempts first. Files opened second.”")
            return Result("examine", True, ["Four shredded paper strips lie in the bin."],
                          display="Four strips of one sentence, in the order you found them:\n" + "\n".join(lines) + "\nSay how you would arrange them, e.g. “arrange 2 1 4 3”.")
        if oid == "computer":
            return Result("examine", True, ["The computer shows a console prompt."],
                          display="EXEC-CONSOLE ready. Commands: `summary`, `help`. Say e.g. “run summary”.")
        if oid == "cctv":
            return Result("examine", True, ["The corridor feed is paused on a figure."],
                          display="CAM 04 · EXEC CORRIDOR, 22:03. A person in a dark jacket carries a laptop sleeve. Face hidden by glare. "
                                  "This shows a person-shaped figure, not who it is.")
        if oid == "statement":
            t = C.STATEMENT
            return Result("examine", True, ["A framed draft public statement hangs on the wall."],
                          display=f"**{t['title']}**\n" + "\n".join(t["lines"]) + f"\n_{t['footer']}_")
        # door
        if set(CLUES) <= self.inventory:
            return Result("examine", True, ["The archive door has a five-digit keypad."], display="Keypad: five digits. You are carrying all three clues. Say e.g. “enter 12345”.")
        return Result("examine", True, ["The archive door has a five-digit keypad that wants evidence in hand."],
                      display="Keypad: five digits. The panel only accepts an attempt from someone carrying all three clues.")

    def _desk(self, part: str) -> Result:
        self.looked.add("desk")
        if part == "blotter":
            self.found.add("note")
            return Result("desk_note", True, ["A handwritten note is wedged under the blotter."],
                          display="Handwritten note: `19 _ _ 4`" + ("" if "note" in self.inventory else "  (say “take note”)"))
        if part == "drawer":
            self.found.add("slip")
            return Result("desk_slip", True, ["The drawer holds a loaner checkout slip."],
                          display="Loaner checkout slip: " + ITEMS["slip"][1] + ("" if "slip" in self.inventory else "  (say “take slip”)"))
        return Result("desk_pad", True, ["A pencil rubbing on the legal pad."], display="Pencil impression: `LT-77 -> who has it? ask IT`  (a lead, not a solution)")

    def _arrange(self, order: list[int]) -> Result:
        self.looked.add("bin")
        if self.sentence_done:
            return Result("bin_done", True, ["The strips are already taped."])
        if sorted(order[:4]) != [1, 2, 3, 4] or len(order) < 4:
            self.wrong_order += 1
            return Result("bin_bad_input", False, ["The player must use each of the four strip numbers once."])
        if order[:4] != BIN_SOLUTION:
            self.wrong_order += 1
            return Result("bin_wrong", False, ["The strips taped together do not make a sentence."])
        self.sentence_done = True
        self.found.add("sentence")
        return Result("bin_solved", True, ["The strips form a sentence."], display="Taped sentence: “Failed attempts first. Files opened second.”  (say “take sentence”)")

    def _console(self, cmd: str) -> Result:
        self.looked.add("computer")
        if cmd == "summary":
            self.counters_seen = True
            self.found.add("counters")
            return Result("console_summary", True, ["The console prints a session summary for the incident window."],
                          display=f"SESSION SUMMARY 21:50-22:30\n  Failed sign-ins ...... {C.COUNTERS['failed']}\n  Files accessed ....... {C.COUNTERS['files']}\n  Exports .............. 1"
                                  + ("" if "counters" in self.inventory else "\n(say “take printout”)"))
        if cmd in ("help", "?"):
            return Result("console_help", True, ["The console lists its commands."], display="Commands: `summary`, `help`.")
        return Result("console_unknown", False, ["The console did not recognise that command."], display=f"command not found: {cmd[:24]}. Try `help`.")

    def _take(self, low: str) -> Result:
        if re.search(r"\b(all|everything)\b", low):
            got = [i for i in ITEMS if i in self.found and i not in self.inventory]
        else:
            got = [i for i, pat in ITEM_ALIAS.items() if re.search(pat, low) and i in self.found and i not in self.inventory]
            if not got:
                already = [i for i, pat in ITEM_ALIAS.items() if re.search(pat, low) and i in self.inventory]
                if already:
                    return Result("take_dup", False, ["The player already carries that item."])
                if any(re.search(pat, low) for pat in ITEM_ALIAS.values()):
                    return Result("take_missing", False, ["The player has not found that item yet."])
                return Result("take_unknown", False, ["There is nothing like that to take."])
        if not got:
            return Result("take_missing", False, ["There is nothing new to take."])
        self.inventory.update(got)
        names = ", ".join(ITEMS[i][0] for i in got)
        return Result("take", True, [f"The player pockets: {names}."], display=f"Added to inventory: {names}")

    def _try_code(self, code: str) -> Result:
        self.looked.add("door")
        missing = [ITEMS[c][0] for c in CLUES if c not in self.inventory]
        if missing:
            return Result("code_blocked", False, ["The keypad refuses the attempt because the player is not carrying all three clues."],
                          display="Keypad: attempt refused. Missing from your inventory: " + ", ".join(missing))
        if code != KEY:
            self.wrong_code += 1
            alarm = self.wrong_code % MAX_TRIES_BEFORE_ALARM == 0
            return Result("code_wrong", False, ["The keypad rejects the code." + (" A silent alarm logs the failed attempts." if alarm else "")],
                          display="ACCESS DENIED." + (" (Three failures logged. Think before you try again.)" if alarm else ""))
        self.escaped = True
        return Result("escape", True, ["The keypad accepts the code and the archive door unlocks."], display="KEY ACCEPTED. Archive decrypted. The door opens.", win=True)

    # ---------------------------------------------------------- scoring
    def score(self) -> dict:
        s = 1000 - 15 * max(0, self.moves - 14) - 60 * self.hints - 40 * self.wrong_code - 25 * self.wrong_order
        s = max(100, s)
        grade = "S" if s >= 900 else "A" if s >= 750 else "B" if s >= 550 else "C"
        return {"score": s, "grade": grade, "moves": self.moves, "hints": self.hints, "wrong_codes": self.wrong_code}
