# Baseline demonstration (not a final application)

`vulnerable_baseline.py` is the deliberately vulnerable "LLM is the referee" game. It exists only so the tests can show the weakness
that the two real applications remove:

- Version 1 (Streamlit): `streamlit_app/`
- Version 2 (FastAPI): `server/` + `static/`

Offline demo: `python baseline_demo/vulnerable_baseline.py --mock`
