from __future__ import annotations

import os
from dotenv import load_dotenv
from google import genai

# Load environment variables
load_dotenv()

# Validate API key once
api_key = os.getenv("GOOGLE_API_KEY")
if not api_key:
    raise RuntimeError("GOOGLE_API_KEY is not configured.")

# Create ONE persistent client
client = genai.Client(api_key=api_key)


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

    response = client.models.generate_content(
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