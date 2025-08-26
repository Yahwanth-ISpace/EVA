from typing import List, Dict
import google.generativeai as genai
from config import PROVIDER
import os

genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

def grounded_prompt(context_chunks: List[Dict], question: str) -> str:
    cites = "\n\n".join([f"[{c['doc_id']}:{c.get('chunk_id')}] {c['text']}" for c in context_chunks])
    return f"""
SYSTEM:
Answer ONLY from the CONTEXT. If insufficient, say what is missing.
Include citations [doc:chunk].

CONTEXT:
{cites}

USER QUESTION:
{question}
"""

def generate_answer(context: List[Dict], question: str) -> str:
    prompt = grounded_prompt(context, question)
    if PROVIDER == "gemini":
        model = genai.GenerativeModel("gemini-1.5-flash")
        resp = model.generate_content(prompt)
        return resp.text.strip()
    return "Provider not supported."
