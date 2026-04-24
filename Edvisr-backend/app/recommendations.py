from app.ai import get_ai_client

def get_intervention_recommendations(student_name: str, trend: str, average_pct: float | None, weak_concepts: list[str]) -> str:
    """
    Generate 3 actionable intervention strategies for a student using Groq AI.
    """
    
    concepts_text = ", ".join(weak_concepts) if weak_concepts else "General gaps in recent units"
    avg_text = f"{average_pct}%" if average_pct is not None else "N/A"
    
    prompt = f"""
You are an expert pedagogical consultant. Provide 3 highly specific, actionable intervention strategies for the following student:

Student Name: {student_name}
Performance Trend: {trend}
Current Average: {avg_text}
Weak Concepts: {concepts_text}

Instructions:
- Provide exactly 3 strategies.
- Each strategy should be a single paragraph.
- Be specific (e.g., recommend specific resource types like 'Khan Academy', 'Peer Tutoring', or 'Flipped Classroom').
- Focus on practical steps the teacher can take immediately.
- Use a supportive and professional tone.

Format the response as a bulleted list or numbered list.
"""

    completion = get_ai_client().chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {"role": "system", "content": "You are an expert pedagogical consultant specializing in data-driven intervention."},
            {"role": "user", "content": prompt},
        ],
        temperature=0.6,
    )

    return completion.choices[0].message.content or ""
