"""Functional tests: Python owns every rule."""
from conftest import solve_room1, solve_room2, solve_room3_analysis

from server import content as C


# ---- Room 1 --------------------------------------------------------------
def test_timer_starts_only_at_begin(clock):
    from server.engine import Game
    g = Game("timer_test_1", now=clock, persist=False)
    clock.advance(500)
    assert g.act("state")["state"]["time_left"] == C.DURATION
    g.act("phase", {"to": "briefing"})
    clock.advance(500)
    assert g.act("state")["state"]["time_left"] == C.DURATION
    g.act("begin")
    clock.advance(10)
    assert g.act("state")["state"]["time_left"] == C.DURATION - 10


def test_idle_gap_is_capped(game, clock):
    clock.advance(3600)          # player closes laptop for an hour
    assert game.act("state")["state"]["time_left"] >= C.DURATION - 15


def test_timeout_fails_mission(game, clock):
    for _ in range(130):
        clock.advance(14)
        game.act("state")
    st = game.act("state")["state"]
    assert st["phase"] == "failed" and st["end"]["cause"] == "time"


def test_cannot_collect_what_you_have_not_found(game):
    r = game.act("collect", {"id": "ev_note"})
    assert r["ok"] is False and "ev_note" not in game.evidence


def test_note_then_collect(game):
    game.act("desk_item", {"item": "blotter"})
    r = game.act("collect", {"id": "ev_note"})
    assert r["ok"] and "ev_note" in game.evidence


def test_bin_wrong_then_right(game):
    assert game.act("bin_submit", {"order": ["s2", "s1", "s3", "s4"]})["ok"] is False
    assert game.act("bin_submit", {"order": C.BIN_ORDER})["solved"] is True


def test_console_gating_before_unlock(game):
    out = game.act("console", {"cmd": "sessions"})
    assert "RESTRICTED" in out["lines"][0]


def test_summary_counters(game):
    out = game.act("console", {"cmd": "summary"})
    assert any("3" in l for l in out["lines"]) and any("7" in l for l in out["lines"])


def test_wrong_key_order_rejected(game):
    r = game.act("keypad", {"code": "19734"})
    assert r["ok"] is False and not game.flags.get("archive_unlocked")


def test_keypad_lockout_and_penalty(game, clock):
    for _ in range(3):
        game.act("keypad", {"code": "00000"})
    before = game.time_left()
    r = game.act("keypad", {"code": C.RECOVERY_KEY})        # correct key during lockout must fail
    assert r["ok"] is False and r.get("locked")
    assert game.penalty >= 45
    clock.advance(31)
    assert game.act("keypad", {"code": C.RECOVERY_KEY})["state"]["flags"]["archive_unlocked"]


def test_key_must_be_five_digits(game):
    assert game.act("keypad", {"code": "1937"})["ok"] is False
    assert game.act("keypad", {"code": "abcde"})["ok"] is False


def test_mail_search_server_side(game):
    r = game.act("mail_search", {"box": "exec", "q": "LT-77"})
    assert [m["id"] for m in r["mails"]] == ["m06"] or "m06" in [m["id"] for m in r["mails"]]
    assert game.act("mail_search", {"box": "exec", "q": "zzzz"})["mails"] == []


def test_header_check_needs_real_anomalies(game):
    game.act("mail_open", {"box": "quarantine", "id": "q01"})
    bad = game.act("header_submit", {"id": "q01", "flags": [4, 5, 6, 7]})          # From/To/Subject/Date
    assert bad["ok"] is False
    good = game.act("header_submit", {"id": "q01", "flags": [0, 1, 3, 8]})
    assert good["verified"] is True


def test_spoof_evidence_needs_header_check(game):
    game.act("mail_open", {"box": "quarantine", "id": "q01"})
    assert game.act("collect", {"id": "ev_spoof"})["ok"] is False


def test_room2_locked_until_archive(game):
    r = game.act("logs")
    assert r["ok"] is False and r["code"] == "locked"
    assert game.act("travel", {"to": 2})["ok"] is False


def test_full_room1_unlocks_room2(game):
    r = solve_room1(game)
    assert r["state"]["unlocked"]["2"] is True
    assert game.act("travel", {"to": 2})["ok"]


# ---- Room 2 --------------------------------------------------------------
def test_logs_dataset_has_no_answer_flags(game):
    solve_room1(game)
    game.act("travel", {"to": 2})
    rows = game.act("logs")["rows"]
    assert len(rows) >= 25 and all("anomalous" not in r for r in rows)


def test_log_counts_match_console_counters():
    fails = [r for r in C.LOGS if r["device"] == "LT-77" and r["event"] == "FAILED"]
    files = [r for r in C.LOGS if r["device"] == "LT-77" and r["type"] == "FILE"]
    assert len(fails) == C.COUNTERS["failed"] and len(files) == C.COUNTERS["files"]


def test_logs_rejects_vpn_decoy(game):
    solve_room1(game)
    game.act("travel", {"to": 2})
    r = game.act("logs_submit", {"ids": ["l13", "l14", "l15"]})
    assert r["ok"] is False and not game.flags.get("r2_logs")
    assert game.penalty == C.LOG_PENALTY


def test_logs_accepts_correct_set(game):
    solve_room1(game)
    game.act("travel", {"to": 2})
    assert game.act("logs_submit", {"ids": sorted(C.LOG_TRUE)})["passed"]


def test_fingerprint_wrong_and_right(game):
    solve_room1(game)
    game.act("travel", {"to": 2})
    wrong = game.act("fingerprint_compare", {"asset": "LT-12"})
    assert wrong["matched"] is False and not game.flags.get("r2_fingerprint")
    right = game.act("fingerprint_compare", {"asset": "LT-77"})
    assert right["matched"] and game.flags["r2_fingerprint"]


def test_route_requires_exact_hop(game):
    solve_room1(game)
    game.act("travel", {"to": 2})
    assert game.act("route_submit", {"trace": "T2", "hop": "h2"})["ok"] is False   # legit VPN hop
    assert game.act("route_submit", {"trace": "T1", "hop": "h2"})["passed"]


def test_clock_needs_footage_and_right_offset(game):
    solve_room1(game)
    game.viewed.discard("cctv:figure")
    game.act("travel", {"to": 2})
    assert game.act("clock_sync", {"offset": 90})["ok"] is False
    game.viewed.add("cctv:figure")
    assert game.act("clock_sync", {"offset": 60})["ok"] is False
    r = game.act("clock_sync", {"offset": 90})
    assert r["passed"] and r["corrected"] == "22:04:47"


def test_room3_unlocks_after_core_three(game):
    solve_room1(game)
    game.act("travel", {"to": 2})
    game.act("logs_submit", {"ids": sorted(C.LOG_TRUE)})
    game.act("fingerprint_compare", {"asset": "LT-77"})
    assert game.unlocked[3] is False
    game.act("route_submit", {"trace": "T1", "hop": "h2"})
    assert game.unlocked[3] is True


# ---- Room 3 --------------------------------------------------------------
def _ready(game):
    solve_room1(game)
    solve_room2(game)
    solve_room3_analysis(game)


def test_board_invalid_link_costs_time(game):
    solve_room1(game)
    solve_room2(game)
    game.act("travel", {"to": 3})
    before = game.penalty
    r = game.act("board_link", {"a": "ev_statement", "b": "ev_counters"})
    assert r["valid"] is False and game.penalty == before + C.BOARD_LINK_PENALTY


def test_board_valid_link_explains(game):
    solve_room1(game)
    solve_room2(game)
    game.act("travel", {"to": 3})
    r = game.act("board_link", {"a": "ev_cctv", "b": "ev_clock"})
    assert r["valid"] and "22:04:47" in r["msg"]


def test_timeline_raw_camera_time_is_wrong(game):
    solve_room1(game)
    solve_room2(game)
    game.act("travel", {"to": 3})
    raw = ["t1", "t3", "t2", "t4", "t5", "t6"]            # camera time taken at face value
    assert game.act("timeline_submit", {"order": raw})["ok"] is False
    assert game.act("timeline_submit", {"order": C.TIMELINE_ORDER})["passed"]


def test_timeline_rejects_decoys(game):
    solve_room1(game)
    solve_room2(game)
    game.act("travel", {"to": 3})
    r = game.act("timeline_submit", {"order": ["d2", "d1", "t1", "t2", "t3", "t4"]})
    assert r["ok"] is False


def test_findings_all_or_nothing(game):
    solve_room1(game)
    solve_room2(game)
    game.act("travel", {"to": 3})
    ans = {f["id"]: f["supported"] for f in C.FINDINGS}
    ans["f5"] = True            # blames a person
    r = game.act("findings_submit", {"answers": ans})
    assert r["ok"] is False and r["bad"] == 1


def test_response_blocked_until_analysis_done(game):
    solve_room1(game)
    solve_room2(game)
    game.act("travel", {"to": 3})
    r = game.act("response_submit", {"plan": ["a_preserve"]})
    assert r["ok"] is False and r["code"] == "notready"


def test_response_success(game):
    _ready(game)
    plan = ["a_preserve", "a_revoke", "a_isolate", "a_reset", "a_notify", "a_restrict"]
    r = game.act("response_submit", {"plan": plan})
    assert r["outcome"] == "success"
    st = r["state"]
    assert st["phase"] == "success" and st["end"]["grade"] in "SABC"


def test_response_missing_steps_rejected_not_failed(game):
    _ready(game)
    r = game.act("response_submit", {"plan": ["a_preserve", "a_notify"]})
    assert r["outcome"] == "rejected" and len(r["gaps"]) == 3
    assert r["state"]["phase"] == "room3"


def test_response_critical_ends_mission(game):
    _ready(game)
    for bad in ("a_wipe", "a_accuse", "a_purge", "a_wait"):
        g2 = type(game)("x" + bad, now=game._now, persist=False)
        g2.act("begin")
        g2.__dict__.update({k: (v.copy() if hasattr(v, "copy") else v) for k, v in game.__dict__.items() if k not in ("sid",)})
        r = g2.act("response_submit", {"plan": ["a_preserve", "a_revoke", "a_isolate", "a_reset", "a_notify", bad]})
        assert r["outcome"] == "critical" and r["state"]["end"]["cause"] == bad


def test_order_note_reset_before_revoke(game):
    _ready(game)
    r = game.act("response_submit", {"plan": ["a_preserve", "a_reset", "a_revoke", "a_isolate", "a_notify"]})
    assert r["outcome"] == "success" and r["notes"]


def test_hints_limited_to_three(game):
    for _ in range(3):
        assert game.act("hint")["ok"]
    r = game.act("hint")
    assert r["ok"] is False and r["code"] == "nohints"


def test_hints_never_contain_key(game):
    for _ in range(3):
        h = game.act("hint")["hint"]
        assert C.RECOVERY_KEY not in h and "19374" not in h


def test_state_survives_roundtrip(game):
    solve_room1(game)
    d = game.to_dict()
    from server.engine import Game
    g2 = Game("roundtrip_1", now=game._now, persist=False)
    g2.load_dict(d)
    assert g2.evidence == game.evidence and g2.unlocked == game.unlocked and g2.flags == game.flags
