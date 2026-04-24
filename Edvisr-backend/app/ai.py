import os
from google import genai

_client = None

def get_ai_client() -> genai.Client:
    global _client
    if _client is None:
        api_key = os.getenv("GOOGLE_API_KEY")
        if not api_key:
            raise RuntimeError("GOOGLE_API_KEY is not configured.")
        _client = genai.Client(api_key=api_key)
    return _client
