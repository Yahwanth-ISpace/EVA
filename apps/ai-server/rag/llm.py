from typing import List, Dict
import google.generativeai as genai
from config import PROVIDER
import os
import re
import logging

# Configure Gemini API
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def grounded_prompt(
    context_chunks: List[Dict], 
    question: str, 
    conversation_history: List[Dict] = []
) -> str:
    cites = "\n\n".join([f"[{c.get('chunk_id')}] {c['text']}" for c in context_chunks])
    return f"""
SYSTEM:
You are a professional insurance assistant.
- Answer only using the CONTEXT provided.
- Summarize clearly, concisely, and professionally.
- Highlight structured key values (coverage %, deductibles, limits, annual max, validity, group numbers, etc.) inside fenced ```markdown``` blocks.
- Place inline key numeric values in **bold**.
- Notes, warnings, or instructions should appear in blockquotes (use > in Markdown).
- Use headings, lists, tables, and inline code appropriately.
- Only create tables when structured data is present.
- Adapt your response to the user question:
    - If the question is specific, only include relevant info.
    - If the question is generic, provide a complete plan summary.
    - Include headings only if they improve readability.
- Avoid repeating information already covered in the conversation history.
- Keep Markdown rendering clean and readable.
- Remove all [doc:x] citations.

CONTEXT:
{cites}

USER QUESTION:
{question}
"""

FINAL_ANSWER_FORMAT = """
Provide a professional, Markdown-renderable response:

Rules:
- Introductory text is normal Markdown.
- Use tables only for structured data like service types and coverage.
- Keep spacing, line breaks, and readability clean.
- Avoid [doc:x] citations.
- Use headings like ## or ### only when needed.
- Keep notes, warnings, or tips in blockquotes (>).
- Place inline key numeric values in **bold**.
- Avoid repeating information that was already provided in recent conversation history.
- Write professional, concise, and clear responses suitable for frontend display.
"""

def clean_output(text: str) -> str:
    """Remove [doc:x] style citations."""
    return re.sub(r"doc:\d+", "", text).strip()

def generate_answer(
    context: List[Dict], 
    question: str, 
    conversation_history: List[Dict] = []
) -> str:
    """Generate grounded insurance answer with Gemini."""
    prompt = grounded_prompt(context, question, conversation_history) + "\n" + FINAL_ANSWER_FORMAT

    if PROVIDER == "gemini":
        try:
            model = genai.GenerativeModel("gemini-2.5-flash")  # v1 only
            resp = model.generate_content(prompt)
            return clean_output(resp.text.strip())
        except Exception as e:
            logger.error(f"Gemini API error: {e}")
            return "⚠️ Sorry, I couldn’t generate an answer right now. Please try again."

    return "Provider not supported."
