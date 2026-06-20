from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from google import genai
import urllib.parse
import os
import requests
import random
import json
import re

load_dotenv()

app = FastAPI(title="Vizzy Chat API")

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
HF_API_KEY   = os.getenv("HF_API_KEY")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

class Message(BaseModel):
    role: str      
    content: str


class GenerateRequest(BaseModel):
    prompt: str
    style:  str
    tone:   str
    count:  int
    mode:   str
    history: list[Message] = []


def call_gemini(prompt: str) -> str:
    response = client.models.generate_content(model="gemini-3.5-flash", contents=prompt)
    return (response.text or "").strip()

def call_groq(prompt: str) -> str:
    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"}
    body = {"model": "llama-3.1-8b-instant", "messages": [{"role": "user", "content": prompt}]}
    res = requests.post(url, headers=headers, json=body, timeout=15)
    if res.status_code == 200:
        return res.json()["choices"][0]["message"]["content"]
    raise Exception(f"Groq failed: {res.status_code}")

def call_huggingface(prompt: str) -> str:
    url = "https://api-inference.huggingface.co/models/google/flan-t5-large"
    res = requests.post(url, headers={"Authorization": f"Bearer {HF_API_KEY}"},
                        json={"inputs": prompt}, timeout=15)
    data = res.json()
    if isinstance(data, list):
        return data[0].get("generated_text", "")
    raise Exception("HF failed")

def llm(prompt: str) -> str:
    for name, fn in [("Gemini", call_gemini), ("Groq", call_groq), ("HuggingFace", call_huggingface)]:
        try:
            result = fn(prompt)
            if result:
                print(f"✅ {name} used")
                return result
        except Exception as e:
            print(f"❌ {name} failed: {e}")
    return ""

def parse_json(raw: str) -> dict | None:
    try:
        clean = re.sub(r"```(?:json)?", "", raw).strip().strip("`").strip()
        return json.loads(clean)
    except Exception:
        return None


def format_history(history: list[Message]) -> str:
    if not history:
        return "No prior conversation."
    return "\n".join(
        f"{'User' if m.role == 'user' else 'Vizzy'}: {m.content}"
        for m in history
    )

def already_asked_question(history: list[Message]) -> bool:
    return any(m.role == "assistant" and "?" in m.content for m in history)


PATHWAY_KEYWORDS = {
    "story":     ["story", "storybook", "scene by scene", "chapter", "narrative", "kids story", "visualize it"],
    "poster":    ["poster", "signage", "quote", "affirmation", "banner", "sale", "announcement"],
    "moodboard": ["moodboard", "mood board", "vision board", "collage", "goals", "aesthetic"],
}

def detect_pathway(prompt: str, history: list[Message]) -> str:
    combined = prompt.lower() + " " + " ".join(m.content.lower() for m in history)
    for pathway, keywords in PATHWAY_KEYWORDS.items():
        if any(kw in combined for kw in keywords):
            return pathway
    return "art"


def decide_action(prompt: str, history: list[Message], style: str, tone: str, mode: str, pathway: str) -> dict:
    # Never ask twice
    if already_asked_question(history):
        return {"action": "generate"}

    history_text = format_history(history)

    decision_prompt = f"""
You are Vizzy, a creative AI assistant for generating visual art, posters, moodboards, stories, and more.

CONVERSATION SO FAR:
{history_text}

LATEST USER MESSAGE: {prompt}
DETECTED PATHWAY: {pathway}
MODE: {mode} (home=personal, biz=business/marketing)

TASK: Decide whether you have enough context to generate great visuals, or whether ONE short clarifying question would significantly improve the result.

RULES:
1. If the request is specific enough (mentions style, subject, colors, mood, product, etc.) → generate immediately.
2. If the request is very vague (e.g. "paint how my year felt", "something beautiful", "show my inner landscape") → ask ONE warm, short question about feelings/memories/goals.
3. For pathway=story → ask for the story theme/age group if not given.
4. For pathway=poster → ask for the key message if not given.
5. For pathway=moodboard → ask what mood or goals they want to capture if not given.
6. For biz mode vague requests → ask about their product or brand mood.
7. If history already has a clarifying answer → always generate.

Respond with ONLY valid JSON:
{{"action": "question", "question": "Short warm question here?"}}
OR
{{"action": "generate"}}
"""

    raw = llm(decision_prompt)
    result = parse_json(raw)
    if result and result.get("action") in ("question", "generate"):
        return result

    # Heuristic fallback
    vague = ["how my", "my year", "my life", "inner", "landscape", "something", "anything",
             "beautiful", "vibe", "mood", "energy", "dream", "emotion", "feeling"]
    is_vague = len(prompt.split()) < 7 or any(kw in prompt.lower() for kw in vague)

    if is_vague:
        fallback_q = {
            "story":     "What's the story about, and how old are the kids?",
            "poster":    "What's the key message you want on the poster?",
            "moodboard": "What mood or goals do you want this board to capture?",
            "art":       "What feelings or moments stand out most — joy, struggle, change, something else?",
        }
        return {"action": "question", "question": fallback_q.get(pathway, fallback_q["art"])}

    return {"action": "generate"}

def build_story_scenes(prompt: str, history: list[Message], style: str, tone: str, count: int) -> list[dict]:
    """Returns a list of {scene_title, image_prompt} dicts."""
    history_text = format_history(history)

    scene_prompt = f"""
You are a creative children's storybook director.

CONVERSATION:
{history_text}
USER: {prompt}

Create {count} sequential story scenes. For each scene write:
- A short scene title (3–5 words)
- A vivid image-generation prompt in {style} style with {tone} tone

Return ONLY valid JSON array, no markdown:
[
  {{"title": "Scene title", "image_prompt": "Detailed visual prompt..."}},
  ...
]
"""
    raw = llm(scene_prompt)
    scenes = parse_json(raw)
    if isinstance(scenes, list) and scenes:
        return scenes[:count]

    # Fallback: generate generic scenes
    base = f"{prompt}, {style} style, {tone} tone"
    return [{"title": f"Scene {i+1}", "image_prompt": f"{base}, scene {i+1}"} for i in range(count)]


def build_poster_data(prompt: str, history: list[Message], style: str, tone: str) -> dict:
    history_text = format_history(history)

    poster_prompt = f"""
You are a creative director specialising in poster design.

CONVERSATION:
{history_text}
USER: {prompt}
STYLE: {style}, TONE: {tone}

Return ONLY valid JSON:
{{
  "headline": "Short punchy headline (max 6 words)",
  "subtext": "Supporting line (max 12 words)",
  "image_prompt": "Detailed image generation prompt for the poster background/visual"
}}
"""
    raw = llm(poster_prompt)
    result = parse_json(raw)
    if result and "image_prompt" in result:
        return result
    return {
        "headline": "Make It Yours",
        "subtext": "A poster made just for you.",
        "image_prompt": f"{prompt}, poster style, {style}, {tone}"
    }


def build_image_prompt(prompt: str, history: list[Message], style: str, tone: str, mode: str) -> str:
    history_text = format_history(history)

    enhancement_prompt = f"""
You are an expert creative director generating AI image prompts.

CONVERSATION CONTEXT:
{history_text}

USER REQUEST: {prompt}
STYLE: {style}, TONE: {tone}, MODE: {mode}

Write ONLY a single detailed image-generation prompt. No preamble, no explanation — just the descriptive text.
Use the conversation context to make it personal and vivid.
"""
    result = llm(enhancement_prompt)
    return result if result else prompt


def build_reply(prompt: str, history: list[Message], style: str, tone: str, pathway: str) -> str:
    history_text = format_history(history)
    reply_prompt = f"""
You are Vizzy, a warm creative AI.

CONVERSATION:
{history_text}
USER: {prompt}
PATHWAY: {pathway}, STYLE: {style}, TONE: {tone}

Write ONE short friendly sentence acknowledging what you're creating. Be specific to their actual request — no generic "here are your images". Max 20 words.
"""
    result = llm(reply_prompt)
    if result:
        # Trim to first sentence
        return result.split(".")[0].strip() + "."
    return f"Creating your {pathway} now in {style} style."


def make_image_url(prompt_text: str, seed: int) -> str:
    clean = prompt_text.strip().strip('"').strip("'")
    encoded = urllib.parse.quote(clean)
    rand_seed = random.randint(1, 99999)
    return f"https://image.pollinations.ai/prompt/{encoded}?seed={rand_seed}&width=512&height=512&model=turbo&nologo=true"


@app.post("/generate")
def generate(data: GenerateRequest):
    prompt = data.prompt.strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="prompt cannot be empty")

    count = max(1, min(data.count, 4))
    pathway = detect_pathway(prompt, data.history)
    decision = decide_action(prompt, data.history, data.style, data.tone, data.mode, pathway)

    if decision["action"] == "question":
        return {
            "type": "question",
            "message": decision["question"],
            "pathway": pathway,
            "images": [],
            "scenes": []
        }

    reply = build_reply(prompt, data.history, data.style, data.tone, pathway)

    if pathway == "story":
        scenes = build_story_scenes(prompt, data.history, data.style, data.tone, count)
        images = [
            {"url": make_image_url(s["image_prompt"], i), "caption": s["title"]}
            for i, s in enumerate(scenes)
        ]
        return {
            "type": "story",
            "message": reply,
            "pathway": "story",
            "images": images,
            "scenes": [s["title"] for s in scenes]
        }

    if pathway == "poster":
        poster = build_poster_data(prompt, data.history, data.style, data.tone)
        images = [{"url": make_image_url(poster["image_prompt"], i), "caption": None} for i in range(count)]
        return {
            "type": "poster",
            "message": reply,
            "pathway": "poster",
            "headline": poster.get("headline", ""),
            "subtext":  poster.get("subtext", ""),
            "images":   images,
            "scenes": []
        }

    enhanced = build_image_prompt(prompt, data.history, data.style, data.tone, data.mode)
    images = [{"url": make_image_url(enhanced, i), "caption": None} for i in range(count)]

    return {
        "type": "images",
        "message": reply,
        "pathway": pathway,
        "images": images,
        "scenes": []
    }

@app.get("/health")
def health():
    return {"status": "ok"}