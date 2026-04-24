from __future__ import annotations

import os
from dotenv import load_dotenv
from google import genai

# Load environment variables
load_dotenv()

from app.ai import get_ai_client


def generate_what_if_question(topic: str) -> str:
    """
    Generate one creative "What if?" question based on the given topic.
    """

    prompt = f"""
You are an expert educator and question designer.

Create ONE thought-provoking "What if?" question based on the topic: "{topic}".

Rules:
- The question must explore a realistic alternate scenario where a key event, concept, or assumption changes
- It should encourage critical, causal, or imaginative thinking
- It must be age-appropriate and suitable for students
- Do NOT include explanations, answers, or extra text

Output format:
- A single sentence phrased as a question
"""

    response = get_ai_client().models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
        config={
            "temperature": 0.7,
            "top_p": 0.9,
            # "top_k": 40,
            "max_output_tokens": 800,
        },
    )

    return response.text or ""