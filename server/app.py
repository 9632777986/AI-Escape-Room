"""FastAPI app: serves the game client and a thin JSON API over the engine."""
from __future__ import annotations

import json
import re
import threading
from pathlib import Path

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from . import gm
from .envload import load_env
from .engine import SAVE_DIR, Game, GameError

load_env()  # optional local .env (git-ignored); real env vars win
ROOT = Path(__file__).resolve().parent.parent
STATIC = ROOT / "static"

app = FastAPI(title="NVIDIA: THE FALL (fictional simulation)", docs_url="/api/docs", redoc_url=None)
_games: dict[str, Game] = {}
_lock = threading.Lock()
SID_RE = re.compile(r"^[A-Za-z0-9_-]{8,64}$")
MAX_BODY = 20_000


def get_game(sid: str | None) -> Game:
    if not sid or not SID_RE.fullmatch(sid):
        raise HTTPException(400, "Missing or invalid session id.")
    g = _games.get(sid)
    if g is None:
        g = Game(sid)
        f = SAVE_DIR / f"{sid}.json"
        if f.exists():
            try:
                g.load_dict(json.loads(f.read_text()))
            except Exception:
                g.reset()
        _games[sid] = g
    return g


@app.get("/api/health")
def health():
    return {"ok": True, "llm": gm.llm_available()}


@app.get("/api/state")
def state(x_session: str | None = Header(default=None)):
    with _lock:
        g = get_game(x_session)
        out = g.act("state")
        out["llm"] = gm.llm_available()
        return out


@app.post("/api/act/{name}")
async def act(name: str, request: Request, x_session: str | None = Header(default=None)):
    raw = await request.body()
    if len(raw) > MAX_BODY:
        raise HTTPException(413, "Request too large.")
    try:
        body = json.loads(raw) if raw else {}
    except ValueError:
        raise HTTPException(400, "Bad JSON.")
    if not isinstance(body, dict):
        raise HTTPException(400, "Body must be an object.")
    if not re.fullmatch(r"[a-z_]{1,32}", name):
        raise HTTPException(404, "Unknown action.")
    with _lock:
        g = get_game(x_session)
        try:
            return g.act(name, body)
        except GameError as e:
            return JSONResponse({"ok": False, "msg": e.msg, "code": e.code, "events": [], "state": g.public()})


# static client. Relative URLs inside index.html keep it working behind Colab's port proxy.
app.mount("/static", StaticFiles(directory=STATIC), name="static")


@app.get("/")
def index():
    return FileResponse(STATIC / "index.html", headers={"Cache-Control": "no-store"})
