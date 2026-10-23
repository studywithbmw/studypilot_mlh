"""Exam Predictor: previous-year papers + a syllabus -> repeated topics and likely questions.

The LLM does two jobs only: reading structure out of text (syllabus units, question
papers) and phrasing predicted questions. Every number shown to the student —
times asked, marks share, recency, years since last asked and the final likelihood
score — is computed here in plain Python, deterministically. The "likelihood score"
is a heuristic 0-100 ranking, not a probability.
"""
import logging
import re
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Callable

import numpy as np
from fastapi.concurrency import run_in_threadpool

from . import db, llm
from .config import settings
from .errors import AppError, NotFoundError
from .loaders import IngestError, load_pages
from .rerank import tokens

log = logging.getLogger("studypilot.exam")

# Scoring weights (named, so the formula and the UI stay in one place).
WEIGHT_FREQUENCY = 0.40
WEIGHT_RECENCY = 0.25
WEIGHT_MARKS = 0.20
WEIGHT_DUE_GAP = 0.15

# A question is "fresh" enough to count fully until this many years old.
RECENCY_HALF_LIFE_YEARS = 3.0
# A topic last asked this many years ago (or more) is treated as fully "due".
DUE_GAP_CAP_YEARS = 4

# Embedding-first topic mapping: below this cosine similarity the LLM decides.
MAPPING_SIMILARITY_THRESHOLD = 0.55
# Jaccard overlap above which two question texts are the same question.
DUPLICATE_JACCARD = 0.90

TOP_PREDICTED_TOPICS = 8
PREDICTIONS_PER_TOPIC = 3
MAX_QUESTIONS_PER_PAPER = 120
DISCLAIMER = "Based on past patterns. Not guaranteed."

_QUESTION_TYPES = {
    "mcq": "mcq", "multiple choice": "mcq", "multiple_choice": "mcq", "choice": "mcq",
    "short": "short", "short answer": "short", "short_answer": "short", "brief": "short",
    "long": "long", "long answer": "long", "long_answer": "long", "essay": "long",
    "numerical": "numerical", "numeric": "numerical", "calculation": "numerical", "problem": "numerical",
    "theory": "theory", "derivation": "theory", "proof": "theory", "describe": "theory",
}


# ---------------------------------------------------------------------------
# Scoring (pure functions; covered by backend/tests/test_exam_scoring.py)
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class TopicScore:
    topic: str
    unit: str
    times_asked: int
    years_asked: tuple[int, ...]
    marks_share: float
    recency_weight: float
    years_since_last_asked: int
    frequency: float
    recency: float
    marks: float
    due_gap: float
    likelihood: float


def safe_year(value: Any) -> int | None:
    try:
        year = int(value)
    except (TypeError, ValueError):
        return None
    return year if 1900 <= year <= 2100 else None


def safe_marks(value: Any) -> float:
    if value in (None, ""):
        return 0.0
    try:
        marks = float(value)
    except (TypeError, ValueError):
        return 0.0
    return max(0.0, min(100.0, marks))


def recency_decay(year: int, current_year: int, half_life: float = RECENCY_HALF_LIFE_YEARS) -> float:
    """0.5 ^ (age / half-life): a 3-year-old paper counts half as much as this year's."""
    age = max(0, current_year - int(year))
    return 0.5 ** (age / half_life)


def years_since_last_asked(years: list[int] | tuple[int, ...], current_year: int) -> int:
    known = [int(y) for y in years if y is not None]
    if not known:
        return 0
    return max(0, int(current_year) - max(known))


def question_years(question: dict) -> list[int]:
    """Every year a (deduped) question was asked, falling back to its single ``year``."""
    known = [safe_year(y) for y in (question.get("years") or [])]
    years = sorted({y for y in known if y is not None})
    if years:
        return years
    year = safe_year(question.get("year"))
    return [year] if year is not None else []


def score_topics(questions: list[dict], current_year: int) -> list[TopicScore]:
    """Per-topic likelihood, highest first. Empty input -> empty list.

    Each term is normalised against the strongest topic so all four live in 0..1:
    frequency, recency (exponential decay), marks share and due gap. Ties are
    broken by times asked, then alphabetically, so the order is stable.
    """
    grouped: dict[str, dict[str, Any]] = {}
    total_marks = 0.0
    for q in questions:
        topic = str(q.get("topic") or "").strip()
        if not topic:
            continue
        marks = safe_marks(q.get("marks"))
        total_marks += marks
        row = grouped.setdefault(
            topic,
            {"unit": str(q.get("unit") or ""), "times": 0, "years": set(), "marks": 0.0, "recency": 0.0},
        )
        occurrences = question_years(q)
        row["times"] += max(len(occurrences), 1)  # a question with no year still counts once
        row["marks"] += marks
        if not row["unit"]:
            row["unit"] = str(q.get("unit") or "")
        for year in occurrences:
            row["years"].add(year)
            row["recency"] += recency_decay(year, current_year)
    if not grouped:
        return []

    max_times = max(r["times"] for r in grouped.values())
    max_recency = max(r["recency"] for r in grouped.values())
    shares = {t: (r["marks"] / total_marks if total_marks > 0 else 0.0) for t, r in grouped.items()}
    max_share = max(shares.values())

    scored: list[TopicScore] = []
    for topic, row in grouped.items():
        years = tuple(sorted(row["years"]))
        frequency = row["times"] / max_times if max_times else 0.0
        recency = row["recency"] / max_recency if max_recency else 0.0
        marks = shares[topic] / max_share if max_share else 0.0
        gap_years = years_since_last_asked(years, current_year)
        due_gap = min(gap_years / DUE_GAP_CAP_YEARS, 1.0)
        likelihood = 100 * (
            WEIGHT_FREQUENCY * frequency
            + WEIGHT_RECENCY * recency
            + WEIGHT_MARKS * marks
            + WEIGHT_DUE_GAP * due_gap
        )
        scored.append(
            TopicScore(
                topic=topic,
                unit=row["unit"],
                times_asked=row["times"],
                years_asked=years,
                marks_share=shares[topic],
                recency_weight=recency,
                years_since_last_asked=gap_years,
                frequency=frequency,
                recency=recency,
                marks=marks,
                due_gap=due_gap,
                likelihood=round(likelihood, 1),
            )
        )
    return sorted(scored, key=lambda s: (-s.likelihood, -s.times_asked, s.topic.lower()))


def _year_evidence(years: tuple[int, ...] | list[int]) -> str:
    """One-line, data-only explanation used when the model's "why" cites nothing real."""
    known = sorted({int(y) for y in years})
    if known:
        return f"Asked in {', '.join(str(y) for y in known[-3:])}."
    return "Repeated in the uploaded papers."


_YEAR = re.compile(r"\b(19|20)\d{2}\b")


def cite_only_years(why: str, years: tuple[int, ...] | list[int]) -> str:
    """Keep the model's sentence only if it cites a year that really appears in the data."""
    known = {int(y) for y in years}
    text = str(why or "").strip()
    cited = {int(m.group(0)) for m in _YEAR.finditer(text)}
    if text and cited and cited <= known:  # every year it mentions must be real
        return text[:200]
    return _year_evidence(years)


# ---------------------------------------------------------------------------
# Dedupe
# ---------------------------------------------------------------------------
def text_similarity(a: str, b: str) -> float:
    ta, tb = tokens(a), tokens(b)
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / len(ta | tb)


def dedupe_questions(questions: list[dict], threshold: float = DUPLICATE_JACCARD) -> list[dict]:
    """Collapse near-duplicates (the same question reworded across years) into one entry,
    keeping every year it appeared so frequency and recency stay honest."""
    kept: list[dict] = []
    for q in questions:
        text = str(q.get("text") or "").strip()
        if not text:
            continue
        years = question_years(q)
        match = next((k for k in kept if text_similarity(text, k["text"]) >= threshold), None)
        if match is not None:
            match["years"] = sorted(set(match["years"]) | set(years))
            match["year"] = min(match["years"]) if match["years"] else match.get("year")
            continue
        kept.append({**q, "text": text, "years": years, "year": min(years) if years else q.get("year")})
    return kept


# ---------------------------------------------------------------------------
# Validation of model output (strict, with one corrective retry)
# ---------------------------------------------------------------------------
def normalize_syllabus(raw: Any) -> list[dict]:
    units_raw = raw.get("units") if isinstance(raw, dict) else raw
    if not isinstance(units_raw, list):
        raise ValueError("units must be a list")
    units: list[dict] = []
    seen: set[str] = set()
    for item in units_raw:
        if not isinstance(item, dict):
            continue
        name = str(item.get("unit") or item.get("name") or "").strip()[:120]
        topics_raw = item.get("topics") or []
        if isinstance(topics_raw, str):
            topics_raw = [topics_raw]
        topics: list[str] = []
        for entry in topics_raw:
            if isinstance(entry, dict):
                entry = entry.get("topic") or entry.get("name") or ""
            label = str(entry).strip()[:120]
            key = label.lower()
            if not label or key in seen:
                continue
            seen.add(key)
            topics.append(label)
        if name and topics:
            units.append({"unit": name, "topics": topics})
    if not units:
        raise ValueError("no units with topics")
    return units[:40]


def normalize_questions(raw: Any, year: int | None, limit: int = MAX_QUESTIONS_PER_PAPER) -> list[dict]:
    items = raw.get("questions") if isinstance(raw, dict) else raw
    if not isinstance(items, list):
        raise ValueError("questions must be a list")
    out: list[dict] = []
    for item in items:
        if isinstance(item, str):
            item = {"text": item}
        if not isinstance(item, dict):
            continue
        text = str(item.get("text") or item.get("question") or "").strip()
        if len(text) < 8:
            continue
        kind = str(item.get("qtype") or item.get("type") or "other").strip().lower()
        marks = safe_marks(item.get("marks"))
        seen_year = safe_year(year)
        out.append(
            {
                "text": text[:1000],
                "marks": marks if marks > 0 else None,
                "qtype": _QUESTION_TYPES.get(kind, "other"),
                "unit": str(item.get("unit") or "").strip()[:120] or None,
                "year": seen_year,
                "years": [seen_year] if seen_year else [],
                "topic": "",
            }
        )
        if len(out) >= limit:
            break
    if not out:
        raise ValueError("no usable questions")
    return out


def normalize_assignments(raw: Any, labels: list[str]) -> dict[int, str]:
    items = raw.get("assignments") if isinstance(raw, dict) else raw
    allowed = set(labels)
    out: dict[int, str] = {}
    for item in items or []:
        if not isinstance(item, dict):
            continue
        try:
            local_id = int(item.get("id"))
        except (TypeError, ValueError):
            continue
        label = str(item.get("topic") or "").strip()
        if label in allowed:
            out[local_id] = label
    if not out:
        raise ValueError("no valid assignments")
    return out


def normalize_predictions(raw: Any) -> dict[str, list[dict]]:
    items = raw.get("topics") if isinstance(raw, dict) else raw
    out: dict[str, list[dict]] = {}
    for item in items or []:
        if not isinstance(item, dict):
            continue
        topic = str(item.get("topic") or "").strip()
        cleaned: list[dict] = []
        for prediction in item.get("predictions") or []:
            if isinstance(prediction, str):
                text, why = prediction.strip(), ""
            elif isinstance(prediction, dict):
                text = str(prediction.get("text") or prediction.get("question") or "").strip()
                why = str(prediction.get("why") or "")
            else:
                continue
            if len(text) < 8:
                continue
            cleaned.append({"text": text[:600], "why": why})
            if len(cleaned) >= PREDICTIONS_PER_TOPIC:
                break
        if topic and cleaned:
            out[topic] = cleaned
    if not out:
        raise ValueError("no predictions")
    return out


async def _validated_json(
    messages: list[dict[str, str]],
    validator: Callable[[Any], Any],
    *,
    alias: str = "auto",
    max_tokens: int,
) -> Any:
    """Ask for JSON, validate it, and give the model exactly one corrective retry."""
    last: Exception | None = None
    for attempt in (1, 2):
        try:
            raw = await llm.complete_json(messages, alias=alias, max_tokens=max_tokens)
            return validator(raw)
        except (ValueError, KeyError, TypeError) as exc:
            last = exc
            if attempt == 1:
                messages = [
                    {"role": "system", "content": messages[0]["content"] + " Your last answer was rejected: every field must be present and non-empty. Reply with ONLY the JSON object."},
                    {"role": "user", "content": messages[-1]["content"]},
                ]
    raise AppError(
        f"The AI could not read this material ({last}). Try again or use a clearer file.",
        code="generation_failed",
        status_code=502,
    )


# ---------------------------------------------------------------------------
# LLM steps
# ---------------------------------------------------------------------------
async def parse_syllabus(text: str, alias: str = "auto") -> list[dict]:
    system = (
        "You read a course syllabus and list its units and the topics inside each unit. "
        "Copy topic names from the syllabus; do not invent, merge or rename them. "
        "At most 40 units, at most 25 topics per unit.\n"
        'Return ONLY JSON: {"units":[{"unit":"Unit 1: Process Management","topics":["Process states","CPU scheduling"]}]}'
    )
    return await _validated_json(
        [{"role": "system", "content": system}, {"role": "user", "content": f"SYLLABUS:\n{text[:16000]}"}],
        normalize_syllabus,
        alias=alias,
        max_tokens=2500,
    )


async def extract_questions(paper_text: str, year: int | None, alias: str = "auto") -> list[dict]:
    system = (
        "You extract exam questions from one previous-year question paper. Copy every numbered question as written; "
        "never solve, rewrite or invent one. One item per question. marks is the number printed beside it (null if none). "
        "qtype is one of mcq, short, long, numerical, theory, other. unit is the section heading it appears under, if any.\n"
        'Return ONLY JSON: {"questions":[{"text":"...","marks":5,"qtype":"long","unit":"Unit 2"}]}'
    )
    return await _validated_json(
        [
            {"role": "system", "content": system},
            {"role": "user", "content": f"EXAM YEAR: {year or 'unknown'}\n\nPAPER:\n{paper_text[:18000]}"},
        ],
        lambda raw: normalize_questions(raw, year),
        alias=alias,
        max_tokens=3000,
    )


def _embedding_similarity(question_texts: list[str], topic_labels: list[str]) -> list[list[float]] | None:
    """Cosine similarity between questions and topics using the existing embedder."""
    from .store import get_store

    embedder = get_store().embedder
    questions = np.asarray(list(embedder.passage_embed(question_texts)), dtype=np.float32)
    topics = np.asarray(list(embedder.passage_embed(topic_labels)), dtype=np.float32)

    def unit_rows(matrix: np.ndarray) -> np.ndarray:
        return matrix / np.maximum(np.linalg.norm(matrix, axis=1, keepdims=True), 1e-9)

    return (unit_rows(questions) @ unit_rows(topics).T).tolist()


async def _llm_assign(
    questions: list[dict], indices: list[int], labels: list[str], assigned: dict[int, int], alias: str
) -> None:
    system = (
        "Assign each exam question to the single closest topic from the provided syllabus list. "
        "Use a topic string exactly as it appears; never invent a topic.\n"
        'Return ONLY JSON: {"assignments":[{"id":1,"topic":"Unit name: Topic name"}]}'
    )
    for start in range(0, len(indices), 25):
        batch = indices[start : start + 25]
        payload = [{"id": position + 1, "question": questions[index]["text"]} for position, index in enumerate(batch)]
        user = "SYLLABUS TOPICS:\n" + "\n".join(f"- {label}" for label in labels) + "\n\nQUESTIONS:\n" + db.jdump(payload)
        try:
            raw = await llm.complete_json(
                [{"role": "system", "content": system}, {"role": "user", "content": user}],
                alias=alias,
                max_tokens=1500,
            )
            chosen = normalize_assignments(raw, labels)
        except Exception:  # noqa: BLE001 - keep the embedding guess rather than fail the report
            log.warning("LLM topic mapping failed for %d question(s); keeping the embedding guess", len(batch))
            continue
        for local_id, label in chosen.items():
            if 1 <= local_id <= len(batch):
                assigned[batch[local_id - 1]] = labels.index(label)


async def map_to_topics(questions: list[dict], units: list[dict], alias: str = "auto") -> list[dict]:
    """Embedding similarity first; the LLM only decides the low-confidence matches."""
    flat = [(unit["unit"], topic) for unit in units for topic in unit["topics"]]
    if not flat:
        raise AppError("The syllabus has no topics to map questions to.", code="generation_failed", status_code=502)
    labels = [f"{unit}: {topic}" for unit, topic in flat]

    try:
        similarities = await run_in_threadpool(_embedding_similarity, [q["text"] for q in questions], labels)
    except Exception:  # noqa: BLE001 - the embedder may be unavailable; the LLM can still map
        log.warning("Embedding topic mapping unavailable; falling back to the LLM")
        similarities = None

    assigned: dict[int, int] = {}
    low_confidence: list[int] = []
    if similarities:
        for index, row in enumerate(similarities):
            best = max(range(len(row)), key=row.__getitem__) if row else 0
            assigned[index] = best
            if not row or row[best] < MAPPING_SIMILARITY_THRESHOLD:
                low_confidence.append(index)
    else:
        low_confidence = list(range(len(questions)))

    if low_confidence:
        await _llm_assign(questions, low_confidence, labels, assigned, alias)

    mapped: list[dict] = []
    for index, question in enumerate(questions):
        unit, topic = flat[assigned.get(index, 0)]
        mapped.append({**question, "topic": topic, "unit": unit})
    return mapped


def group_by_topic(questions: list[dict]) -> dict[str, list[dict]]:
    grouped: dict[str, list[dict]] = {}
    for question in questions:
        topic = str(question.get("topic") or "").strip()
        if topic:
            grouped.setdefault(topic, []).append(question)
    return grouped


def fallback_predictions(topic_questions: list[dict], years: tuple[int, ...]) -> list[dict]:
    """No (usable) model answer: reuse the most recent real questions, honestly labelled."""
    recent = sorted(topic_questions, key=lambda q: max(question_years(q), default=0), reverse=True)
    why = _year_evidence(years)
    return [{"text": q["text"], "why": why} for q in recent[:PREDICTIONS_PER_TOPIC]]


async def predict_questions(
    scored: list[TopicScore], by_topic: dict[str, list[dict]], alias: str = "auto"
) -> dict[str, list[dict]]:
    """Top topics: 3 predicted questions each, grounded in that topic's real past questions."""
    top = scored[:TOP_PREDICTED_TOPICS]
    if not top:
        return {}
    payload = [
        {
            "topic": score.topic,
            "years": list(score.years_asked),
            "pastQuestions": [
                {"years": question_years(q), "text": q["text"], "marks": q.get("marks")}
                for q in by_topic.get(score.topic, [])[:8]
            ],
        }
        for score in top
    ]
    system = (
        "You predict likely exam questions from past papers. For each topic use ONLY the past questions listed for it. "
        f"Write exactly {PREDICTIONS_PER_TOPIC} new questions in the same style and difficulty; never add a topic or a year. "
        'The "why" is one short sentence and MUST cite at least one year that appears in that topic\'s "years" list.\n'
        'Return ONLY JSON: {"topics":[{"topic":"exact topic name","predictions":[{"text":"...","why":"Asked in 2022 and 2023 as a 5-mark derivation."}]}]}'
    )

    predicted: dict[str, list[dict]] = {}
    try:
        raw = await llm.complete_json(
            [{"role": "system", "content": system}, {"role": "user", "content": db.jdump(payload)}],
            alias=alias,
            max_tokens=3500,
        )
        predicted = normalize_predictions(raw)
    except Exception:  # noqa: BLE001 - predictions are optional; the maths is not
        log.warning("LLM question prediction unavailable; falling back to real past questions")

    out: dict[str, list[dict]] = {}
    for score in top:
        raw_items = predicted.get(score.topic) or []
        cleaned = [
            {"text": item["text"], "why": cite_only_years(item["why"], score.years_asked)} for item in raw_items
        ]
        out[score.topic] = cleaned or fallback_predictions(by_topic.get(score.topic, []), score.years_asked)
    return out


# ---------------------------------------------------------------------------
# Report persistence
# ---------------------------------------------------------------------------
def create_report(user_id: str, workspace_id: str, title: str) -> dict:
    report_id = db.new_id()
    db.run(
        "INSERT INTO exam_reports(id,user_id,workspace_id,title,status,progress,created_at) VALUES(?,?,?,?,?,?,?)",
        (report_id, user_id, workspace_id, title.strip()[:160] or "Exam prediction", "queued", 0, db.now_iso()),
    )
    return get_report(user_id, report_id)


def report_to_dict(row: dict) -> dict:
    result = db.jload(row["result_json"], {}) or {}
    return {
        "id": row["id"],
        "workspaceId": row["workspace_id"],
        "title": row["title"],
        "status": row["status"],
        "progress": row["progress"],
        "createdAt": row["created_at"],
        **result,
    }


def get_report(user_id: str, report_id: str) -> dict:
    row = db.one("SELECT * FROM exam_reports WHERE id=? AND user_id=?", (report_id, user_id))
    if not row:
        raise NotFoundError("Exam report not found.")
    return report_to_dict(row)


def list_reports(user_id: str, workspace_id: str) -> list[dict]:
    rows = db.query(
        "SELECT * FROM exam_reports WHERE user_id=? AND workspace_id=? ORDER BY created_at DESC",
        (user_id, workspace_id),
    )
    out = []
    for row in rows:
        result = db.jload(row["result_json"], {}) or {}
        topics = result.get("topics") or []
        out.append(
            {
                "id": row["id"],
                "workspaceId": row["workspace_id"],
                "title": row["title"],
                "status": row["status"],
                "progress": row["progress"],
                "questionCount": int(result.get("questionCount") or 0),
                "years": result.get("years") or [],
                "topTopics": [t.get("topic", "") for t in topics[:3]],
                "createdAt": row["created_at"],
            }
        )
    return out


def _update(report_id: str, *, progress: int | None = None, status: str | None = None, result: dict | None = None) -> None:
    sets, values = [], []
    if progress is not None:
        sets.append("progress=?")
        values.append(max(0, min(100, progress)))
    if status is not None:
        sets.append("status=?")
        values.append(status)
    if result is not None:
        sets.append("result_json=?")
        values.append(db.jdump(result))
    if sets:
        db.run(f"UPDATE exam_reports SET {', '.join(sets)} WHERE id=?", (*values, report_id))


def _save_questions(report_id: str, questions: list[dict]) -> None:
    statements: list[tuple[str, tuple]] = [("DELETE FROM exam_questions WHERE report_id=?", (report_id,))]
    statements += [
        (
            "INSERT INTO exam_questions(id,report_id,year,text,marks,qtype,unit,topic) VALUES(?,?,?,?,?,?,?,?)",
            (db.new_id(), report_id, safe_year(q.get("year")), q["text"], q.get("marks"), q.get("qtype"), q.get("unit"), q.get("topic")),
        )
        for q in questions
    ]
    db.run_many(statements)


def build_result(
    scored: list[TopicScore],
    by_topic: dict[str, list[dict]],
    predictions: dict[str, list[dict]],
    documents: list[dict],
    questions: list[dict],
    paper_years: list[int],
) -> dict:
    return {
        "years": sorted({int(y) for y in paper_years}),
        "questionCount": len(questions),
        "documents": documents,
        "topics": [
            {
                "topic": score.topic,
                "unit": score.unit,
                "likelihood": score.likelihood,
                "timesAsked": score.times_asked,
                "yearsAsked": list(score.years_asked),
                "marksShare": round(score.marks_share, 4),
                "recencyWeight": round(score.recency_weight, 3),
                "yearsSinceLastAsked": score.years_since_last_asked,
                "yearCounts": _year_counts(by_topic.get(score.topic, [])),
                "questions": [
                    {
                        "text": q["text"],
                        "year": min(question_years(q), default=None),
                        "years": question_years(q),
                        "marks": q.get("marks"),
                        "qtype": q.get("qtype") or "other",
                        "unit": q.get("unit"),
                    }
                    for q in by_topic.get(score.topic, [])
                ],
                "predictions": predictions.get(score.topic, []),
            }
            for score in scored
        ],
        "weights": {
            "frequency": WEIGHT_FREQUENCY,
            "recency": WEIGHT_RECENCY,
            "marks": WEIGHT_MARKS,
            "dueGap": WEIGHT_DUE_GAP,
        },
        "disclaimer": DISCLAIMER,
        "computedAt": db.now_iso(),
    }


def _year_counts(questions: list[dict]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for question in questions:
        for year in question_years(question):
            counts[str(year)] = counts.get(str(year), 0) + 1
    return counts


def _document_text(user_id: str, document_id: str) -> tuple[str, str]:
    """Read one uploaded file's text with the same loader the ingestion pipeline uses."""
    doc = db.one("SELECT * FROM documents WHERE id=? AND user_id=?", (document_id, user_id))
    if not doc:
        raise NotFoundError("Document not found.")
    if doc["type"] in ("web", "youtube"):
        raise AppError(
            "Exam Predictor needs uploaded files (PDF, DOCX, PPTX, TXT or MD), not links.",
            code="unsupported_type",
            status_code=422,
        )
    folder = settings.upload_dir / document_id
    files = [p for p in folder.iterdir() if p.is_file()] if folder.exists() else []
    if not files:
        raise AppError("The original file is gone. Upload it again.", code="gone", status_code=410)
    try:
        pages, _ = load_pages(files[0])
    except IngestError as exc:
        raise AppError(str(exc), code="unsupported_type", status_code=422) from None
    return "\n\n".join(page.text for page in pages).strip(), doc["name"]


async def run_analysis(
    report_id: str, user_id: str, workspace_id: str, sources: list[dict], alias: str = "auto"
) -> None:
    """Background task: extract -> map -> score -> predict, updating progress as it goes."""
    try:
        _update(report_id, status="running", progress=2, result={})
        syllabus_parts: list[str] = []
        papers: list[tuple[str, int | None]] = []
        documents: list[dict] = []
        for source in sources:
            text = source.get("text") or ""
            name = source.get("name") or "Uploaded document"
            if not text:
                text, name = await run_in_threadpool(_document_text, user_id, source["documentId"])
            kind = "syllabus" if source.get("kind") == "syllabus" else "paper"
            year = safe_year(source.get("year"))
            documents.append(
                {"documentId": source.get("documentId"), "name": name, "kind": kind, "year": year}
            )
            if kind == "syllabus":
                syllabus_parts.append(text)
            else:
                papers.append((text, year))
        if not syllabus_parts:
            raise AppError("Tag one document as the syllabus.", code="validation_error", status_code=422)
        if not papers:
            raise AppError("Tag at least one previous-year paper.", code="validation_error", status_code=422)

        units = await parse_syllabus("\n\n".join(syllabus_parts), alias=alias)
        _update(report_id, progress=12)

        questions: list[dict] = []
        for index, (text, year) in enumerate(papers, start=1):
            questions.extend(await extract_questions(text, year, alias=alias))
            _update(report_id, progress=12 + int(33 * index / len(papers)))
        questions = dedupe_questions(questions)
        if not questions:
            raise AppError("No questions could be read from those papers.", code="generation_failed", status_code=502)
        questions = await map_to_topics(questions, units, alias=alias)
        _update(report_id, progress=55)

        current_year = datetime.now(UTC).year
        scored = score_topics(questions, current_year)
        _update(report_id, progress=70)

        by_topic = group_by_topic(questions)
        predictions = await predict_questions(scored, by_topic, alias=alias)
        _update(report_id, progress=92)

        result = build_result(
            scored, by_topic, predictions, documents, questions, [year for _, year in papers if year is not None]
        )
        _save_questions(report_id, questions)
        _update(report_id, status="ready", progress=100, result=result)
        log.info("Exam report %s ready: %d questions, %d topics", report_id, len(questions), len(scored))
    except AppError as exc:
        log.warning("Exam analysis failed for %s: %s", report_id, exc.message)
        _update(report_id, status="error", progress=100, result={"error": exc.message})
    except llm.LLMUnavailable as exc:
        log.warning("Exam analysis hit an AI outage for %s", report_id)
        _update(report_id, status="error", progress=100, result={"error": str(exc)})
    except Exception:  # noqa: BLE001 - a background task must never crash the server
        log.exception("Exam analysis crashed for %s", report_id)
        _update(report_id, status="error", progress=100, result={"error": "Analysis failed. Please try again."})
