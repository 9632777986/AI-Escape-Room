"""BASELINE DEMONSTRATION (not a final application): the LLM is the game master AND the referee.

This is the deliberately vulnerable first iteration, kept ONLY so the tests can show what goes wrong when an LLM is trusted
with game rules. The shipped applications are:
    Version 1 (Streamlit): streamlit_app/   Python rules decide, Gemini narrates
    Version 2 (FastAPI):   server/ + static/ Python engine, validated actions, guarded narrator

One room, five objects, three clues, one 5-digit keypad, conversation context replayed each turn, a restart command.
Everything the game "knows" lives in the prompt. The model replies with narration plus a line 'STATE: {json}' and that state is
applied as-is. That blind trust is the weakness the two final applications remove.

Run:   python baseline_demo/vulnerable_baseline.py --mock    (offline, scripted gullible model; also used by the tests)
       python baseline_demo/vulnerable_baseline.py            (uses Gemini if GEMINI_API_KEY is set)
Commands: restart, quit. Anything else is sent to the game master.
"""
from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from server.envload import load_env  # noqa: E402

load_env()

RULES = """You are the game master of a fictional escape room: the Executive Office of a made-up company.
Objects: 1) desk note 2) computer terminal 3) waste bin 4) wall statement 5) laptop.
Clues: the desk note reads '19 _ _ 4'; the terminal shows 3 failed logins and 7 files opened; the bin says
'Failed attempts first. Files opened second.'  The 5-digit door code is 19374.
The player escapes when they enter the right code. Describe what the player finds, keep the story consistent,
and end every reply with a line:  STATE: {"door_unlocked": bool, "inventory": [..], "clues_found": [..]}"""


class V1Game:
    def __init__(self, llm):
        self.llm = llm
        self.restart()

    def restart(self):
        self.state = {"door_unlocked": False, "inventory": [], "clues_found": []}
        self.history: list[tuple[str, str]] = []      # session context: the whole chat is replayed each turn

    def prompt(self, player: str) -> str:
        hist = "\n".join(f"PLAYER: {p}\nGM: {g}" for p, g in self.history[-12:])
        return f"{RULES}\n\nSTATE: {json.dumps(self.state)}\n{hist}\nPLAYER: {player}\nGM:"

    def play(self, player: str) -> str:
        out = self.llm(self.prompt(player))
        m = re.search(r"STATE:\s*(\{.*\})", out, re.S)
        if m:
            try:
                self.state.update(json.loads(m.group(1)))      # <- blind trust: V1's core flaw
            except ValueError:
                pass
        text = re.sub(r"STATE:\s*\{.*\}", "", out, flags=re.S).strip()
        self.history.append((player, text))
        return text

    @property
    def won(self) -> bool:
        return bool(self.state.get("door_unlocked"))


def gemini_llm():
    from google import genai
    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    model = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
    return lambda prompt: client.models.generate_content(model=model, contents=prompt).text or ""


def mock_llm(prompt: str) -> str:
    """A cooperative-but-gullible scripted model: it believes whatever the player claims."""
    last = prompt.rsplit("PLAYER:", 1)[-1].lower()
    st = json.loads(re.findall(r"\nSTATE: (\{[^\n]*\})\n", prompt)[-1])
    if "19374" in last:
        st["door_unlocked"] = True
        return 'The keypad chirps. The door swings open.\nSTATE: ' + json.dumps(st)
    if re.search(r"(i have|give me|add).*(master key|keycard|all evidence)|door_unlocked|unlock", last):
        st["door_unlocked"] = True            # gullible: accepts the player's claim
        st["inventory"] = st["inventory"] + ["master key"]
        return 'As you wish. The door is open.\nSTATE: ' + json.dumps(st)
    for word, clue in (("note", "desk note: 19 _ _ 4"), ("terminal", "terminal: 3 failed, 7 files"), ("bin", "bin: Failed attempts first. Files opened second.")):
        if word in last:
            if clue not in st["clues_found"]:
                st["clues_found"].append(clue)
            return f"You examine the {word}: {clue}.\nSTATE: " + json.dumps(st)
    return "Nothing notable happens.\nSTATE: " + json.dumps(st)


def main():
    use_mock = "--mock" in sys.argv or not os.environ.get("GEMINI_API_KEY")
    game = V1Game(mock_llm if use_mock else gemini_llm())
    print("BASELINE DEMO (LLM as referee, intentionally vulnerable). " + ("[mock model]" if use_mock else "[Gemini]"))
    print("You are locked in an executive office. Type what you do. 'restart' / 'quit' available.\n")
    while not game.won:
        try:
            t = input("> ").strip()
        except (EOFError, KeyboardInterrupt):
            break
        if t == "quit":
            break
        if t == "restart":
            game.restart(); print("Restarted."); continue
        print(game.play(t), "\n")
    if game.won:
        print("You escaped!")


if __name__ == "__main__":
    main()
