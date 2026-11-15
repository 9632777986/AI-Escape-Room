"""Launch the game locally:  python run.py  (then open http://127.0.0.1:8000)"""
import os
import sys
import webbrowser

import uvicorn

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8000"))
    host = os.environ.get("HOST", "127.0.0.1")
    if "--no-browser" not in sys.argv:
        try:
            webbrowser.open(f"http://127.0.0.1:{port}")
        except Exception:
            pass
    uvicorn.run("server.app:app", host=host, port=port, log_level="warning")
