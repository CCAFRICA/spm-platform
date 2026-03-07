# HF-100: Migrate Header Comprehension to AIService

## Architecture Decision Record

Problem: HC bypasses AIService with raw fetch() to Anthropic API.
Response truncated at max_tokens: 2000, JSON.parse fails, HC returns null.

Option A: Migrate HC to AIService
- Scale test: YES
- AI-first: NO hardcoding
- Atomicity: YES — AIService error recovery + safe fallback
- Single code path (AP-17 compliant)

Option B: Add JSON repair to HC (keep raw fetch)
- VIOLATES AP-17, AIService mandate
- REJECTED

CHOSEN: Option A
