"""NVIDIA: THE FALL, Version 1 (Streamlit + Gemini Game Master).

Run:  streamlit run streamlit_app/app.py
The player types natural language. Python rules decide what happens; Gemini (optional) narrates it.
Fictional simulation: all people, accounts, devices and events are invented.
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import streamlit as st  # noqa: E402

from server import gm  # noqa: E402
from server.envload import load_env  # noqa: E402
from streamlit_app import v1_game as G  # noqa: E402
from streamlit_app import v1_master as M  # noqa: E402

load_env()
st.set_page_config(page_title="NVIDIA: THE FALL (Version 1)", page_icon="🟢", layout="wide")
st.markdown("""<style>
.block-container{padding-top:1.2rem}
h1.big{font-size:3.6rem;letter-spacing:.04em;color:#a6ee35;text-shadow:0 0 24px rgba(118,185,0,.5);margin:0;line-height:.95}
.tag{letter-spacing:.3em;color:#8aa0a4;font-size:.72rem}
.clue{border-left:3px solid #76b900;background:rgba(118,185,0,.08);padding:.5rem .8rem;border-radius:4px;white-space:pre-wrap}
</style>""", unsafe_allow_html=True)

INTRO = (
    "**Friday 13 November 2026, 22:41.** An internal archive was deleted tonight and an employee account was active at the wrong moment. "
    "You are locked in the Executive Office on floor 14. The only way out is the archive door, and its keypad wants a five-digit recovery key that is not written down anywhere in one place."
)
HOW = """
- **Talk to the Game Master in plain language.** Examples: *look around*, *examine the desk*, *lift the blotter*, *take the note*, *arrange strips 2 1 4 3*, *run summary*, *enter 12345*, *what's in my inventory?*, *hint*.
- Six objects can be examined: the desk, the waste bin, the computer, the corridor camera feed, the framed statement and the archive door keypad.
- Find **three clues**, **take** them into your inventory, then work out the five-digit key. The keypad only accepts an attempt from someone carrying all three.
- The Game Master (Gemini, if a key is set) narrates. **Python decides** what is solved, so asking it for the answer or to open the door will not work.
- This is a fictional simulation. An account label or a figure on camera is never proof of who a person is.
"""


def init():
    ss = st.session_state
    if "game" not in ss:
        ss.game = G.RoomGame()
        ss.chat = []
        ss.page = "intro"


def restart():
    ss = st.session_state
    ss.game = G.RoomGame()
    ss.chat = [{"role": "assistant", "text": "Fresh start. The lights flicker back on in the Executive Office. Where do you want to look first?", "display": None}]
    ss.page = "play"


def turn(text: str):
    ss = st.session_state
    out = M.respond(ss.game, ss.chat, text)
    ss.chat.append({"role": "user", "text": text})
    ss.chat.append({"role": "assistant", "text": out["reply"], "display": out.get("display"), "source": out["source"], "notice": out.get("notice"), "blocked": out.get("blocked")})
    if out.get("win"):
        ss.page = "end"


def intro():
    st.markdown("<div class='tag'>VERSION 1 · STREAMLIT · AI GAME MASTER</div><div class='tag' style='margin-top:1rem'>NVIDIA</div>"
                "<h1 class='big'>THE FALL</h1><div class='tag'>THE CEO'S LAST CHANCE</div>", unsafe_allow_html=True)
    st.write("")
    st.markdown(INTRO)
    st.subheader("How to play")
    st.markdown(HOW)
    if gm.llm_available():
        st.success("Gemini Game Master is online.")
    else:
        st.info("No Gemini key found: the built-in offline narrator will answer. The game is fully playable.")
    if st.button("▶ Begin the investigation", type="primary"):
        restart()
        st.rerun()


def sidebar():
    g = st.session_state.game
    p = g.progress()
    with st.sidebar:
        st.markdown("### 🟢 NVIDIA: THE FALL")
        st.caption("Version 1 · Executive Office")
        st.progress(p["clues_found"] / p["clues_total"], text=f"Clues found {p['clues_found']}/{p['clues_total']}")
        st.caption(f"Objects examined {p['objects_seen']}/{p['objects_total']} · Moves {g.moves} · Hints used {g.hints}")
        st.markdown("#### 🎒 Inventory")
        if g.inventory:
            for i in G.ITEMS:
                if i in g.inventory:
                    st.markdown(f"- **{G.ITEMS[i][0]}**: {G.ITEMS[i][1]}")
        else:
            st.caption("Empty. Examine things, then say “take …”.")
        st.divider()
        if st.button("💡 Hint", width="stretch"):
            st.session_state._queue = "hint"
        if st.button("🔄 Restart", width="stretch"):
            restart()
            st.rerun()
        st.caption("Game Master: " + ("Gemini online" if gm.llm_available() else "offline narrator (no key)"))


def play():
    g = st.session_state.game
    sidebar()
    st.markdown("### Executive Office, Floor 14")
    cols = st.columns(len(G.OBJECTS))
    for c, (oid, o) in zip(cols, G.OBJECTS.items()):
        if c.button(f"{o['icon']} {o['name']}", key=f"obj_{oid}", width="stretch"):
            st.session_state._queue = f"examine {o['name'].lower()}"
    for m in st.session_state.chat:
        with st.chat_message("assistant" if m["role"] == "assistant" else "user", avatar="🎙️" if m["role"] == "assistant" else None):
            st.write(m["text"])
            if m.get("display"):
                st.markdown(f"<div class='clue'>{m['display']}</div>", unsafe_allow_html=True)
            if m.get("notice"):
                st.caption("⚠️ " + m["notice"])
    queued = st.session_state.pop("_queue", None)
    typed = st.chat_input("What do you do? (e.g. examine the desk)", max_chars=300)
    text = typed or queued
    if text is not None and text.strip():
        turn(text)
        st.rerun()


def end():
    g = st.session_state.game
    sc = g.score()
    sidebar()
    st.balloons()
    st.markdown("<h1 class='big'>ARCHIVE OPEN</h1>", unsafe_allow_html=True)
    st.success("The door releases. Recovered: the session log showing an unregistered loaner device, LT-77, during the export window.")
    st.write("You solved it by combining three clues: a half-written number, a shredded sentence and the console's counters.")
    a, b, c, d = st.columns(4)
    a.metric("Grade", sc["grade"]); b.metric("Score", sc["score"]); c.metric("Moves", sc["moves"]); d.metric("Hints", sc["hints"])
    st.caption("Fictional scenario. Nothing here identifies a real person.")
    if st.button("🔄 Play again", type="primary"):
        restart()
        st.rerun()


def main():
    init()
    try:
        {"intro": intro, "play": play, "end": end}[st.session_state.page]()
    except st.errors.StreamlitAPIException:
        raise
    except Exception as e:  # keep the app alive on any unexpected error
        st.error(f"Something went wrong ({type(e).__name__}). You can restart safely.")
        if st.button("Restart"):
            restart()
            st.rerun()


main()
