"""Fast, deterministic reranking: semantic score + keyword overlap. No model, no network,
microseconds per query. Also maps scores to the confidence shown under an answer."""
import re

_TOKEN = re.compile(r"\w{3,}", re.UNICODE)
_STOP = {
    "the", "and", "for", "are", "but", "not", "you", "all", "can", "had", "her", "was", "one", "our", "out",
    "what", "when", "where", "which", "who", "why", "how", "does", "did", "this", "that", "these", "those",
    "with", "from", "have", "has", "about", "into", "than", "then", "them", "they", "their", "there", "will",
    "would", "could", "should", "your", "explain", "tell", "give", "show", "list", "describe", "define",
}


def tokens(text: str) -> set[str]:
    return {t for t in _TOKEN.findall(text.lower()) if t not in _STOP}


def rerank(query: str, hits: list[dict], k: int) -> list[dict]:
    """hits carry ``vector_score``; returns the best ``k`` with ``score`` and ranks filled in."""
    q = tokens(query)
    for i, h in enumerate(hits, start=1):
        h["initial_rank"] = i
        overlap = len(q & tokens(h.get("text", ""))) / len(q) if q else 0.0
        h["overlap_score"] = round(overlap, 4)
        h["score"] = round(0.8 * h["vector_score"] + 0.2 * overlap, 4)
    ranked = sorted(hits, key=lambda h: h["score"], reverse=True)[:k]
    for i, h in enumerate(ranked, start=1):
        h["final_rank"] = i
    return ranked


def confidence_percent(score: float) -> int:
    """0..100 from the top combined score (0.30 -> 0, 0.75 -> 100)."""
    return int(round(100 * max(0.0, min(1.0, (score - 0.30) / 0.45))))


def tier_for(percent: int) -> str:
    return "high" if percent >= 75 else "medium" if percent >= 50 else "low"


def follow_up_query(question: str, previous_user_question: str | None) -> str:
    """Resolve 'what about its limits?' without an extra LLM call: short or pronoun-led
    follow-ups are searched together with the previous question."""
    if not previous_user_question:
        return question
    words = question.split()
    pronouns = {"it", "its", "this", "that", "they", "them", "their", "these", "those", "he", "she", "his", "her", "also", "more"}
    if len(words) <= 6 or pronouns & {w.lower().strip("?,.!") for w in words[:4]}:
        return f"{previous_user_question} {question}"
    return question
