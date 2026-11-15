# Test cases and verification record

## Reported automated test result

The submitted project report records **125 passed, 0 failed, 0 skipped**, in under three seconds for the last execution of a newly unpacked project ZIP. Gemini was replaced with scripted test functions, so the automated suite does not require a live API key.

| Test file | Count | Coverage reported |
|---|---:|---|
| `test_engine.py` | 37 | V2 rules, view-before-collect, puzzle solutions, penalties, room unlocking, timer, hints, save/resume |
| `test_adversarial.py` | 39 | Prompt-injection and answer-extraction attempts, output filter, redacted context, model failure fallback, API session handling |
| `test_v1_streamlit.py` | 20 | V1 rules, inventory, keypad, hints, attacks, Streamlit UI flow from intro to win and restart |
| `test_api_integration.py` | 9 | HTTP assets, session validation, oversized/malformed requests, no key in responses |
| `test_comparison.py` | 16 | Same attacks against baseline, V1 and V2 |
| `test_baseline_demo.py` | 4 | Baseline demo behaviour and weaknesses |
| **Total** | **125** | |

## Representative functional test scenarios

These scenarios summarise coverage described in the report. They are not a substitute for an individual test-run log.

| ID | Scenario | Expected behaviour / acceptance criterion | Evidence in report |
|---|---|---|---|
| TC-01 | Start V1 and inspect room objects | Streamlit game starts; player can inspect the six Executive Office objects | V1 UI and rules tests |
| TC-02 | Attempt to enter the recovery code before collecting all clues | Keypad prerequisite prevents trial-and-error attempts | V1 rules tests |
| TC-03 | Collect the three clues and derive the recovery code | The clues combine to produce `19374`; Python validates the code | V1 rules tests and final V1 run |
| TC-04 | Ask Gemini to reveal or change the solution | Model output cannot mutate state or open the archive door | Adversarial and comparison tests |
| TC-05 | Try to collect evidence without viewing it first in V2 | Engine rejects collection of unseen evidence | Engine tests |
| TC-06 | Submit an invalid puzzle answer | Engine returns a failure result and applies the documented penalty rules | Engine tests |
| TC-07 | Try to advance to a later room before resolving its puzzle | Room progression remains gated by the Python engine | Engine tests |
| TC-08 | Send malformed, oversized or invalid-session API requests | API validates session, action and request size; malformed requests are handled without crashing | API integration tests |
| TC-09 | Make a Gemini request fail or omit a usable key | Offline narrator keeps the game playable | Adversarial tests and V1 final run |
| TC-10 | Attempt prompt injection against baseline, V1 and V2 | Baseline demonstrates the weakness; final versions keep authoritative state unchanged | Comparison tests |
| TC-11 | Use V2 email search and drag-and-drop tools in a browser | Browser interaction works without reported errors | Browser test described in report |
| TC-12 | Complete V2 mission | Final incident report is generated; report documents 15 evidence items, grade A and score 5741 | Final V2 run |

## Reported final gameplay outcomes

- **V1:** Archive door opened; grade A; score 785; 25 moves; 0 hints; all 3 clues collected. Gemini calls failed with `ClientError` during this run, so the built-in narrator was used.
- **V2:** Mission completed; grade A; score 5741; 15 evidence items; 1 wrong submission; 0 hints; 06:31 remaining.

## Important reproducibility note

The counts and outcomes above are transcribed from the submitted project report. Re-run the included test suite in the project notebook before making a new claim about the current repository state. Save the fresh terminal output or notebook screenshot if the evaluator requires current execution evidence.
