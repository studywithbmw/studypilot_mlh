# StudyPilot backend (fast edition)

Supabase is used **only for login**. Documents, chats, quizzes, flashcards and vectors live in `./data`
on the machine running the backend, so nothing waits on a remote database.

## First run (Windows PowerShell)

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env      # then edit .env (see below)
python run.py   # auto-reloads on code edits only (not on data writes)
```

The first start downloads the embedding model (~130 MB, once). The server answers immediately;
the log line `Embedding model + vector store ready` tells you when uploads and chat are ready.

## .env checklist

| Variable | What to put |
|---|---|
| `SUPABASE_URL` | **Must be the same project as the frontend's `VITE_SUPABASE_URL`** (otherwise every request is rejected) |
| `GROQ_API_KEY` / `GEMINI_API_KEY` | at least one |
| everything else | optional, defaults are fine |

## Tests

```powershell
pip install pytest
python -m pytest -q
```
