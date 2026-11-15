"""Colab / Jupyter helpers: find the project, load the Gemini key safely, start and stop Version 1 (Streamlit) and Version 2 (FastAPI).

Each app runs as its own subprocess, so they start independently, can run side by side, and can be stopped on their own.
The Gemini key is read from Colab Secrets (GEMINI_API_KEY) or the environment. It is never written to a file or printed.
Without a key both apps run with the offline narrator.
"""
from __future__ import annotations

import os
import socket
import subprocess
import sys
import time
import zipfile
from pathlib import Path

PROJECT_MARKERS = ("server/app.py", "streamlit_app/app.py", "requirements.txt", "static/index.html")


def is_project(p: Path) -> bool:
    return all((p / m).exists() for m in PROJECT_MARKERS)


def find_project(search_in: str | Path = ".") -> Path:
    """Return the project folder (the one that contains server/, streamlit_app/, static/). Raises FileNotFoundError with advice."""
    base = Path(search_in).resolve()
    for cand in [base, *sorted(p for p in base.glob("*") if p.is_dir()), *sorted(base.glob("*/*"))]:
        if cand.is_dir() and is_project(cand):
            return cand
    raise FileNotFoundError(f"Project not found under {base}. Upload NVIDIA_The_Fall_rebuild.zip (cell 1) and run the extract cell.")


def extract_zip(zip_path: str | Path, dest: str | Path = ".") -> Path:
    zip_path, dest = Path(zip_path), Path(dest)
    if not zip_path.exists():
        raise FileNotFoundError(f"{zip_path} does not exist. Upload the ZIP first.")
    if not zipfile.is_zipfile(zip_path):
        raise zipfile.BadZipFile(f"{zip_path} is not a valid ZIP file.")
    with zipfile.ZipFile(zip_path) as z:
        for n in z.namelist():                                   # refuse path traversal
            if Path(n).is_absolute() or ".." in Path(n).parts:
                raise ValueError(f"Unsafe path in ZIP: {n}")
        z.extractall(dest)
    return find_project(dest)


def load_key() -> bool:
    """Put the Gemini key into the environment from Colab Secrets. Returns True if a key is available. Never prints the key."""
    if os.environ.get("GEMINI_API_KEY"):
        return True
    try:
        from google.colab import userdata  # type: ignore
        key = userdata.get("GEMINI_API_KEY")
        if key:
            os.environ["GEMINI_API_KEY"] = key
            return True
    except Exception:  # not in Colab, secret missing, or notebook access not granted -> offline mode
        pass
    return False


def port_free(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.3)
        return s.connect_ex(("127.0.0.1", port)) != 0


def free_port(preferred: int) -> int:
    for p in [preferred, *range(preferred + 1, preferred + 30)]:
        if port_free(p):
            return p
    raise RuntimeError(f"No free port between {preferred} and {preferred + 29}.")


def access_url(port: int, show: bool = True, height: int = 800) -> str:
    """In Colab: embed the app and return its public proxy URL. Elsewhere: the local URL."""
    try:
        from google.colab import output  # type: ignore
        url = output.eval_js(f"google.colab.kernel.proxyPort({port})")
        if show:
            output.serve_kernel_port_as_iframe(port, height=height)
        return str(url)
    except Exception:
        return f"http://127.0.0.1:{port}"


class App:
    """A running app: .url, .port, .stop(), .alive(), .log_tail()."""

    def __init__(self, name: str, proc: subprocess.Popen, port: int, log: Path, url: str):
        self.name, self.proc, self.port, self.log, self.url = name, proc, port, log, url

    def alive(self) -> bool:
        return self.proc.poll() is None

    def log_tail(self, n: int = 25) -> str:
        try:
            return "\n".join(self.log.read_text(errors="replace").splitlines()[-n:])
        except OSError:
            return "(no log)"

    def stop(self):
        if self.alive():
            self.proc.terminate()
            try:
                self.proc.wait(timeout=8)
            except subprocess.TimeoutExpired:
                self.proc.kill()
        print(f"{self.name} stopped (port {self.port} released).")


def _start(name: str, cmd: list[str], project: Path, port: int, wait: float, show: bool, height: int) -> App:
    log = project / f".{name}.log"
    env = dict(os.environ, PYTHONUNBUFFERED="1")
    with open(log, "wb") as f:
        proc = subprocess.Popen(cmd, cwd=project, stdout=f, stderr=subprocess.STDOUT, env=env)
    deadline = time.time() + wait
    while time.time() < deadline:
        if proc.poll() is not None:
            tail = "\n".join(log.read_text(errors="replace").splitlines()[-25:])
            raise RuntimeError(f"{name} exited during startup (code {proc.returncode}). Last log lines:\n{tail}\n"
                               "Hint: re-run the install cell (pip install -r requirements.txt) and the test cell.")
        if not port_free(port):
            break
        time.sleep(0.4)
    else:
        proc.terminate()
        tail = "\n".join(log.read_text(errors="replace").splitlines()[-25:])
        raise TimeoutError(f"{name} did not open port {port} within {wait:.0f}s. Last log lines:\n{tail}")
    return App(name, proc, port, log, access_url(port, show, height))


def launch_streamlit(project: str | Path, port: int = 8501, wait: float = 60, show: bool = True, height: int = 820) -> App:
    """Version 1: Streamlit chat game."""
    project = Path(project)
    if not is_project(project):
        raise FileNotFoundError(f"{project} is not the project folder (missing one of {PROJECT_MARKERS}).")
    key = load_key()
    port = free_port(port)
    cmd = [sys.executable, "-m", "streamlit", "run", "streamlit_app/app.py", "--server.port", str(port), "--server.address", "127.0.0.1",
           "--server.headless", "true", "--server.enableCORS", "false", "--server.enableXsrfProtection", "false",
           "--browser.gatherUsageStats", "false"]
    app = _start("version1_streamlit", cmd, project, port, wait, show, height)
    print(f"Version 1 (Streamlit) is running. Gemini: {'ON' if key else 'OFF (offline narrator)'}\nOpen: {app.url}")
    return app


def launch_fastapi(project: str | Path, port: int = 8000, wait: float = 40, show: bool = True, height: int = 780) -> App:
    """Version 2: FastAPI backend serving the HTML/CSS/JS client."""
    project = Path(project)
    if not is_project(project):
        raise FileNotFoundError(f"{project} is not the project folder (missing one of {PROJECT_MARKERS}).")
    key = load_key()
    port = free_port(port)
    cmd = [sys.executable, "-m", "uvicorn", "server.app:app", "--host", "127.0.0.1", "--port", str(port), "--log-level", "warning"]
    app = _start("version2_fastapi", cmd, project, port, wait, show, height)
    print(f"Version 2 (FastAPI) is running. Gemini: {'ON' if key else 'OFF (offline narrator)'}\nOpen: {app.url}")
    return app
