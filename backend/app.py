from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from google import genai
import urllib.parse
import os
import requests

load_dotenv()

app = FastAPI(title="Creative Chat API")

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
HF_API_KEY = os.getenv("HF_API_KEY")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

class GenerateRequest(BaseModel):
    prompt: str
    style: str
    tone: str
    count: int
    mode: str

def call_groq(prompt: str):
    url = "https://api.groq.com/openai/v1/chat/completions"

    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json"
    }
    body = {
        "model": "llama3-8b-8192",
        "messages": [{"role": "user", "content": prompt}]
    }

    res = requests.post(url, headers=headers, json=body, timeout=10)
    if res.status_code == 200:
        return res.json()["choices"][0]["message"]["content"]
    else:
        raise Exception("Groq failed")


def call_huggingface(prompt: str):
    url = "https://api-inference.huggingface.co/models/google/flan-t5-large"

    headers = {
        "Authorization": f"Bearer {HF_API_KEY}"
    }
    res = requests.post(url, headers=headers, json={"inputs": prompt}, timeout=10)
    data = res.json()

    if isinstance(data, list):
        return data[0].get("generated_text", "")

    if "error" in data:
        print("HF ERROR:", data["error"])
        raise Exception("HF failed")
    return ""


@app.post("/generate")
def generate(data: GenerateRequest):
    prompt = data.prompt.strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="prompt cannot be empty")

    count = max(1, min(data.count, 4))

    full_prompt = f"""
    Write ONLY a single detailed image-generation prompt. No preamble, no headers, no labels, no markdown formatting, no explanations - just the descriptive prompt text itself.

    User idea: {prompt}
    Style: {data.style}
    Tone: {data.tone}
    Make it vivid, artistic, and descriptive.
    """

    enhanced_prompt = ""

    try:
        response = client.models.generate_content(
            model="gemini-3.5-flash",
            contents=full_prompt
        )
        enhanced_prompt = (response.text or "").strip()
        print("Gemini used")

    except Exception as e:
        print("Gemini failed:", str(e))


    if not enhanced_prompt:
        try:
            enhanced_prompt = call_groq(full_prompt)
            print("Groq used")
        except Exception as e:
            print("Groq failed:", str(e))


    if not enhanced_prompt:
        try:
            enhanced_prompt = call_huggingface(full_prompt)
            print("HuggingFace used")
        except Exception as e:
            print("HuggingFace failed:", str(e))


    if not enhanced_prompt:
        enhanced_prompt = prompt
        print("Fallback to original prompt")

    # generate images
    images = []
    encoded = urllib.parse.quote(enhanced_prompt)

    for i in range(count):
        img_url = f"https://image.pollinations.ai/prompt/{encoded}?seed={i}&width=512&height=512&model=turbo&nologo=true"
        images.append({"url": img_url})

    reply_message = f'Here\'s a {data.tone.lower()} take in {data.style.lower()} style, based on: "{prompt}"'
    return {
        "message": reply_message,
        "images": images
    }

@app.get("/health")
def health():
    return {"status": "ok"}