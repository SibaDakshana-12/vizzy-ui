# Creative Chat

A conversational chat UI for generating AI images. Type a prompt, pick a style/tone, and
the app sends it to a backend that enhances the prompt (using Gemini, with Groq and
HuggingFace as automatic fallbacks if Gemini is unavailable) and generates images.

## Live demo

- Frontend: https://vizzy-ui.vercel.app/
- Backend: https://vizzy-ui.onrender.com

> Note: the backend is hosted on Render's free tier, which spins down after
> 15 minutes of inactivity. If the app feels slow or unresponsive on first
> load, give it 30-50 seconds to wake up and try again.

## Project structure

```
vizzy-ui/
├── frontend/
│   ├── index.html     # chat UI
│   ├── style.css       # styling
│   └── script.js       # frontend logic (calls the backend)
└── backend/
    ├── app.py             # FastAPI server
    ├── requirements.txt
    ├── .env               # your real API keys (not committed)
    └── .env.example       # template for the .env file
```

## How it works

1. User types a message in the chat (Home or Business mode).
2. Frontend sends the prompt + full conversation history + style/tone/count to the backend.
3. Backend detects the creative pathway: `art`, `story`, `poster`, or `moodboard`.
4. Backend decides: is there enough context to generate, or should it ask one
   clarifying question first? If vague, it returns a question. Once answered, it generates.
5. Backend asks Gemini to build a detailed image prompt using the full conversation context.
   Falls back automatically to Groq, then HuggingFace, then the original prompt as-is.
6. Backend builds image URLs via Pollinations (free, no key needed) with random seeds.
7. Frontend loads images one at a time with exponential backoff retry on 429s.

## Creative pathways

- **Art** — standard multi-image artwork generation
- **Moodboard** — multi-image grid with varied compositions
- **Story** — scene-by-scene storybook with captions per scene
- **Poster** — single image with AI-generated headline and subtext overlaid

## Deployment

- **Frontend** deployed on Vercel (static, no build step).
- **Backend** deployed on Render as a Python web service:
  `uvicorn app:app --host 0.0.0.0 --port $PORT`
- API keys set as environment variables in Render dashboard.

## Running locally

### Backend

```
cd backend
pip install -r requirements.txt --user
```

Copy `.env.example` to `.env` and add your real API keys:

```
GEMINI_API_KEY=your_real_gemini_key_here
GROQ_API_KEY=your_real_groq_key_here
HF_API_KEY=your_real_huggingface_token_here
```

Only `GEMINI_API_KEY` is required for the app to work at all — `GROQ_API_KEY`
and `HF_API_KEY` are optional fallbacks. If you leave them blank, those steps
will just fail silently and the app falls back further down the chain
(eventually using the original prompt as-is if everything fails).

Start the server:

```
python -m uvicorn app:app --reload --port 5000
```

Check it's running by visiting:
- http://127.0.0.1:5000/health → should return `{"status":"ok"}`
- http://127.0.0.1:5000/docs → interactive API docs (Swagger UI)

### 2. Frontend

Open `frontend/index.html` directly in a browser (double-click the file),
or serve it with a tool like VS Code's "Live Server" extension
(e.g. `http://127.0.0.1:5500/frontend/index.html`). Either way works the
same — no build step needed.

> Note: if `http://127.0.0.1:5000` doesn't load in your normal browser window
> (blank page / stuck loading), it's usually a browser extension or an
> "HTTPS-only" setting blocking localhost. Try it in an Incognito window first
> to confirm — if it works there, disable extensions one by one in your normal
> window to find the culprit, or just develop in Incognito.

## Notes / known limitations

- This is a frontend prototype + a working backend, not a production app —
  there's no real user accounts, persistent chat history, or saved "taste" memory yet.
- Switching between sidebar chats or Home/Business mode currently just resets
  to a fresh empty chat; it doesn't store separate message history per chat.
- Images are generated via Pollinations (free tier), not a paid image API —
  swap this out in `app.py` if you want a different image provider later.
- Pollinations' free/anonymous tier rate-limits aggressively (`HTTP 429`).
  The frontend handles this with staggered loading + exponential backoff
  retries, so images load reliably but can take noticeably longer
  (especially with 3-4 images in one response) than a typical instant
  image API would. This is a deliberate reliability-over-speed tradeoff,
  not a bug.