from __future__ import annotations
import os
from dotenv import load_dotenv


# Load environment variables from .env
load_dotenv()

from app.ai import get_ai_client


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

    completion = get_ai_client().chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {"role": "system", "content": "You are a helpful educational assistant specialized in NCERT curriculum."},
            {"role": "user", "content": prompt},
        ],
        temperature=0.7,
    )

    return completion.choices[0].message.content or ""