# Cold call guide

The screen a caller keeps open beside the phone during a cold call. It shows
which of the eight stages the call is in, what that stage is for, and what
prospects tend to say there. The caller taps what happened, types the
prospect's own words, and moves on. When the call ends it is saved, and a
second screen lists past calls and the stage each one reached.

| | |
|---|---|
| Live app (Vercel) | https://YOUR-APP.vercel.app |
| Backend health (Render) | https://YOUR-SERVICE.onrender.com/health |
| LLM | Google Gemini (`gemini-3.8-flash`, falls back to `gemini-3.5-flash-lite`) |
| What the LLM does | Checks the outcome against the call record before saving, and writes the one-line summary |

The backend is on Render's free tier and sleeps when idle. The first request
after a quiet spell can take up to a minute; the screen says so while it waits.

## What the hundred calls changed

Each of the 100 practice transcripts was read and noted for four things:
where the call ended, whether the prospect talked about their own business,
whether they stated a need in their own words, and whether the outcome the
caller logged matched what was said. A few things from that reading shaped the
screen directly.

- **Where calls end.** 49 ended at the next step, 26 at an objection, 10 at
  the opening, 10 during the purpose and 5 at permission. So "End call" is on
  every stage, and taps that usually end a call (wrong number, call back later,
  asked not to be called) say so and switch the End button on.
- **Purpose: "calling from where?"** 34 prospects asked where the caller was
  calling from, often twice. Only 5 asked where we got their number. The
  purpose stage leads with that, and the tip is to say the company name slowly.
  Questions about cost and motive ("is it paid?", "what's in it for you?")
  came up in 12 calls, so they get their own tap.
- **Objection: "not the right person".** It came up in 20 calls, ahead of
  "we already have consultants" (11). It is the first objection tap, and it
  points the call's outcome at "wrong person" rather than "not interested".
- **Stage 5 rarely happens.** Only 27 calls got the prospect talking about
  their business, and only 15 got a need in the prospect's own words. Those
  mostly came after an open question, not the yes/no questions callers often
  used. Stage 5 has the largest text box, the close screen shows the stage 5
  words back, and it says so plainly when there are none.
- **Logged outcomes were often wrong.** In 36 of 100 calls the outcome was
  empty or did not match the call. All 10 calls logged as "do not call" were
  something else: mostly "not the right person", and one where the prospect
  had agreed to a call the following Thursday. That is where the LLM went.

## Why the LLM checks the outcome

Before a call is saved, the backend sends the call record (each stage's tap
and the prospect's words, plus the outcome and next step the caller picked)
to Gemini. It answers with the outcome the record supports, one sentence on
why, and a summary for the past-calls list.

- If it agrees, the call saves in one step.
- If it disagrees, the screen shows both and the caller decides. The caller
  always has the last word; the past-calls list notes when the saved outcome
  differs from what the check suggested.
- If the model is not configured, times out, is rate limited or returns
  something unusable, a few plain rules do the check instead, so closing a
  call never depends on the model.

This was picked over suggesting the stage live because the caller already
knows which stage they are in. What goes wrong in the transcripts is the record
written afterwards, and that record is what the next call is built on.

The API key lives only on the Render backend. The browser never sees it.

## How it fits together

```
Browser (Vercel, React)  --->  API (Render, FastAPI)  --->  Supabase (Postgres, via its REST API)
                                        |
                                        +--->  Gemini (outcome check)
```

### API

| Method | Path | What it does |
|---|---|---|
| GET | `/health` | Answers when the backend is up; also reports whether the database is reachable |
| POST | `/calls` | Start a call |
| POST | `/calls/{id}/stages` | Save what happened at one stage (saving the same stage again updates it) |
| POST | `/calls/{id}/check` | Run the outcome check without saving |
| POST | `/calls/{id}/close` | Close the call with its outcome, next step and summary |
| GET | `/calls` | List past calls, newest first |
| GET | `/calls/{id}` | One call with its stage-by-stage record |

### Data

The schema is in [`database/schema.sql`](database/schema.sql).

- `stages`: the eight stages, with a one-line purpose each.
- `calls`: one row per call: who, when, the furthest stage reached, the outcome,
  the next step, the summary, and what the check suggested.
- `stage_results`: one row per call and stage: the tap, an outcome the tap
  points to (if any), and the prospect's words.

"Stage reached" is the furthest of stages 1 to 7. Every call passes through
Close, so counting it would make every call look complete.

Row level security is on with no policies, so the public anon key that every
Supabase project ships with can read nothing. Only the backend, using the
secret key, can read or write.

## Running it locally

Backend (Python 3.12):

```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
cp .env.example .env             # then fill in the values, or leave them empty
uvicorn app.main:app --reload --port 8000
```

With no Supabase values set, the backend keeps calls in memory, which is
enough to click through the screens. With no Gemini key, the check uses the
plain rules.

Frontend (Node 20.19 or newer):

```bash
cd frontend
npm install
echo "VITE_API_URL=http://localhost:8000" > .env.local
npm run dev
```

Tests:

```bash
cd backend
pytest
```

## Deploying

1. **Supabase.** Create a project, open the SQL editor, paste in
   `database/schema.sql` and run it. Copy the project URL and the secret key.
2. **Render.** New Web Service from this repo. Root directory `backend`,
   build `pip install -r requirements.txt`, start
   `uvicorn app.main:app --host 0.0.0.0 --port $PORT`, health check path
   `/health`. Environment: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`,
   `GEMINI_API_KEY`, `PYTHON_VERSION=3.12.8`. (`render.yaml` has the same settings.)
3. **Vercel.** Import this repo, root directory `frontend`, framework Vite,
   environment variable `VITE_API_URL` set to the Render URL with no trailing slash.

## About the practice calls

The transcripts this was built from are not in this repository. They were
provided for this exercise only. Every company and person in them is
fictional, including the caller's company, Meridian Growth Partners, whose
name appears on the screen.
