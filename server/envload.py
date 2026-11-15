"""Tiny .env loader (no dependency). Real environment variables always win. Never commit .env."""
from pathlib import Path


def load_env(path: Path | None = None) -> None:
    import os
    p = path or Path(__file__).resolve().parent.parent / ".env"
    if not p.is_file():
        return
    for line in p.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
