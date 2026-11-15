# Security notes

## API key handling

- Store `GEMINI_API_KEY` in Google Colab Secrets or a local environment variable.
- `.env.example` is a template only. It must contain a placeholder, never a real key.
- `.env` must remain ignored by Git.
- Never paste API keys into source files, README text, issue reports or screenshots.
- If a token or key is exposed, revoke or rotate it immediately.

## Application trust boundaries

- Python owns game state, puzzle answers, progression and scoring.
- Gemini returns narration text only and has no tools to alter game state.
- Player input is untrusted. The documented pipeline sanitises input, checks known prompt-injection patterns and limits the context supplied to the model.
- Model output is screened before display.
- Version 2 validates session IDs, action names and request-body size.

## Limitations

Regex-based input screening is not a complete prompt-injection defence. The report's principal security argument is architectural: even if the model is manipulated, it cannot directly modify the Python game state. This is a training project, not a production incident-response platform.
