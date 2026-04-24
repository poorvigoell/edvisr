import os
from dotenv import load_dotenv

load_dotenv()
print("Checking for XAI_API_KEY...")
key = os.getenv("XAI_API_KEY")
if key:
    print(f"Found XAI_API_KEY (length: {len(key)})")
else:
    print("XAI_API_KEY NOT FOUND in environment.")

print("\nAll keys in environment starting with X or G:")
for k in os.environ:
    if k.startswith(("X", "G")):
        print(f"{k}: {os.environ[k][:5]}...")
