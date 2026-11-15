import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from server import content as C  # noqa: E402
from server.engine import Game  # noqa: E402


class Clock:
    def __init__(self):
        self.t = 1000.0

    def __call__(self):
        return self.t

    def advance(self, s):
        self.t += s


@pytest.fixture
def clock():
    return Clock()


@pytest.fixture
def game(clock):
    g = Game("pytest_session", now=clock, persist=False)
    g.act("phase", {"to": "intro"})
    g.act("phase", {"to": "briefing"})
    g.act("begin")
    return g


def solve_room1(g):
    for s in ("statement", "desk", "bin", "cctv", "monitor", "laptop"):
        g.act("interact", {"target": s})
    g.act("desk_item", {"item": "blotter"})
    g.act("desk_item", {"item": "drawer"})
    g.act("desk_item", {"item": "pad"})
    g.act("bin_submit", {"order": C.BIN_ORDER})
    g.act("console", {"cmd": "summary"})
    g.act("cctv_mark", {"t": "22:03:20"})
    for m in ("m03", "m06", "m07", "m12"):
        g.act("mail_open", {"box": "exec", "id": m})
    g.act("mail_open", {"box": "quarantine", "id": "q01"})
    g.act("header_submit", {"id": "q01", "flags": [0, 1, 3, 8]})
    for e in ("ev_statement", "ev_note", "ev_pad", "ev_slip", "ev_fragments", "ev_counters", "ev_it_cctv",
              "ev_it_asset", "ev_legal", "ev_alice_normal", "ev_spoof", "ev_cctv"):
        g.act("collect", {"id": e})
    return g.act("keypad", {"code": C.RECOVERY_KEY})


def solve_room2(g):
    g.act("travel", {"to": 2})
    g.act("logs_submit", {"ids": sorted(C.LOG_TRUE)})
    g.act("fingerprint_compare", {"asset": "LT-77"})
    g.act("route_submit", {"trace": "T1", "hop": "h2"})
    g.act("clock_sync", {"offset": 90})
    for e in ("ev_recovery",):
        g.act("collect", {"id": e})


def solve_room3_analysis(g):
    g.act("travel", {"to": 3})
    for a, b in [("ev_note", "ev_counters"), ("ev_note", "ev_fragments"), ("ev_it_asset", "ev_fingerprint"),
                 ("ev_alice_normal", "ev_fingerprint"), ("ev_spoof", "ev_route"), ("ev_cctv", "ev_clock"),
                 ("ev_clock", "ev_logs")]:
        g.act("board_link", {"a": a, "b": b})
    g.act("timeline_submit", {"order": C.TIMELINE_ORDER})
    g.act("findings_submit", {"answers": {f["id"]: f["supported"] for f in C.FINDINGS}})


@pytest.fixture(autouse=True)
def _reset_gm_rate_limit():
    from server import gm
    gm._calls.clear()
    yield
    gm._calls.clear()
