from __future__ import annotations
import os
from dotenv import load_dotenv
from google import genai

# Load environment variables from .env
load_dotenv()

# Get API key
api_key = os.getenv("GOOGLE_API_KEY")
if not api_key:
    raise RuntimeError("GOOGLE_API_KEY is not configured.")

# Create ONE global client (do not recreate per request)
client = genai.Client(api_key=api_key)


def generate_questions(grade: str, topic: str, difficulty: str) -> str:
    """
    Generate MCQ and theory questions based on the given grade/topic/difficulty.
    """

    prompt = f"""
Generate multiple-choice questions (MCQs) and theory questions for NCERT Class {grade}
on the topic "{topic}".

Difficulty level: {difficulty}

Instructions:
- Generate 5 MCQs with 4 options each
- Clearly mention the correct answer
- Then generate 3 theory questions
- Keep NCERT / PYQ relevance

Format the response clearly.
"""

    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
    )

    return response.text or ""