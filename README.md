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

1. User types a message in the chat.
2. Frontend sends the prompt + selected style/tone/count to the backend (`POST /generate`).
3. Backend asks Gemini to turn that into a detailed image-generation prompt.
   If Gemini fails or is overloaded, it automatically falls back to Groq,
   then HuggingFace, then finally just uses the original prompt as-is —
   so the request never crashes even if every AI provider is down.
4. Backend builds image URLs using that enhanced prompt via Pollinations (free, no key needed).
5. Backend returns a short reply message + the image URLs.
6. The frontend loads each image one at a time (not all at once), and automatically
   retries with increasing delays if Pollinations rate-limits a request — this means
   generating multiple images can take 10-60+ seconds, especially under load, but
   images reliably load instead of silently failing.

## Deployment

- **Frontend** is deployed on [Vercel](https://vercel.com) as a static site
  (the `frontend/` folder, no build step needed).
- **Backend** is deployed on [Render](https://render.com) as a Python web
  service, running `uvicorn app:app --host 0.0.0.0 --port $PORT`.
- API keys (`GEMINI_API_KEY`, `GROQ_API_KEY`, `HF_API_KEY`) are set as
  environment variables directly in Render's dashboard, not committed to the repo.
- `script.js`'s `API_URL` points to the live Render backend URL in production
  (instead of `http://localhost:5000` used during local development).

## Running it locally

(See the **Live demo** links above to try it without setting anything up.)

### 1. Backend

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