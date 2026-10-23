"""Study features built on the user's own documents: summaries, quizzes, flashcards,
weak topics, study plan, mind map and career tools.

Everything here is real: content comes from the uploaded documents through the LLM,
and progress (weak topics, due cards, plan completion) is computed from what the
student actually did. Nothing is pre-filled.
"""
import logging
import math
import re
from datetime import UTC, date, datetime, timedelta
from typing import Any

from fastapi.concurrency import run_in_threadpool

from . import db, llm
from .config import settings
from .errors import AppError, NotFoundError
from .store import get_store

log = logging.getLogger("studypilot.study")


# ---------------------------------------------------------------------------
# Context gathering
# ---------------------------------------------------------------------------
def sample_chunks(chunks: list[dict], max_chars: int) -> list[dict]:
    """Spread picks evenly across the document so the whole thing is covered."""
    total = sum(len(c.get("text", "")) for c in chunks)
    if total <= max_chars or not chunks:
        return chunks
    avg = max(total // len(chunks), 1)
    n = max(max_chars // avg, 1)
    return [chunks[int(i * len(chunks) / n)] for i in range(n)]


def ready_documents(user_id: str, workspace_id: str, doc_id: str | None = None) -> list[dict]:
    if doc_id:
        rows = db.query(
            "SELECT * FROM documents WHERE id=? AND user_id=? AND status='ready'", (doc_id, user_id)
        )
        if not rows:
            raise NotFoundError("That document was not found or is still processing.")
        return rows
    rows = db.query(
        "SELECT * FROM documents WHERE user_id=? AND workspace_id=? AND status='ready' ORDER BY created_at",
        (user_id, workspace_id),
    )
    if not rows:
        raise AppError(
            "Upload a document and wait for it to finish processing first.", code="no_documents", status_code=422
        )
    return rows


def gather_context_sync(
    user_id: str, workspace_id: str, *, doc_id: str | None = None, topic: str | None = None, max_chars: int = 10000
) -> tuple[str, list[dict]]:
    docs = ready_documents(user_id, workspace_id, doc_id)
    store = get_store()
    texts: list[str] = []
    topic = (topic or "").strip()
    if topic:
        hits = store.search(topic, 10, user_id=user_id, workspace_id=workspace_id, doc_ids=[d["id"] for d in docs])
        used = 0
        for h in hits:
            if used + len(h["text"]) > max_chars:
                break
            texts.append(h["text"])
            used += len(h["text"])
    if not texts:
        per_doc = max_chars // max(len(docs), 1)
        for d in docs:
            chunks = sample_chunks(store.get_chunks(d["id"], user_id), per_doc)
            body = "\n".join(c["text"] for c in chunks)
            texts.append(f"### {d['name']}\n{body}" if len(docs) > 1 else body)
    return "\n\n".join(texts), docs


async def gather_context(user_id: str, workspace_id: str, **kw: Any) -> tuple[str, list[dict]]:
    return await run_in_threadpool(lambda: gather_context_sync(user_id, workspace_id, **kw))


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:40] or "topic"


# ---------------------------------------------------------------------------
# Summaries
# ---------------------------------------------------------------------------
SUMMARY_PROMPTS = {
    "short": "Write a 2-3 sentence abstract of the document.",
    "detailed": "Write a structured summary with short headings (## ...) for each major section, 1-3 sentences under each, ending with a 'Key takeaways' list.",
    "bullet": "Write study notes as concise bullet points grouped under bold topic labels. Include formulas, definitions and numbers that matter.",
    "terms": "Write a glossary of the 8-15 most important terms: each as '**Term**: one-sentence definition' using the document's own meaning.",
}


async def generate_summary(user_id: str, doc_id: str, level: str) -> dict:
    doc = db.one("SELECT * FROM documents WHERE id=? AND user_id=?", (doc_id, user_id))
    if not doc:
        raise NotFoundError("Document not found.")
    text, _ = await gather_context(user_id, doc["workspace_id"], doc_id=doc_id, max_chars=settings.max_summary_chars)
    system = (
        "You summarize a student's document. Use ONLY the text provided; do not add outside facts. "
        "Write math in LaTeX ($...$). Reply in Markdown.\n" + SUMMARY_PROMPTS.get(level, SUMMARY_PROMPTS["detailed"])
    )
    content = await llm.complete_text(
        [{"role": "system", "content": system}, {"role": "user", "content": f"DOCUMENT ({doc['name']}):\n{text}"}],
        temperature=0.2, max_tokens=1800,
    )
    return {
        "id": db.new_id(), "workspaceId": doc["workspace_id"], "documentId": doc_id,
        "title": f"{doc['name']} — {level} summary", "level": level, "content": content,
        "citations": [], "createdAt": db.now_iso(),
    }


# ---------------------------------------------------------------------------
# Quizzes
# ---------------------------------------------------------------------------
def normalize_questions(raw: Any, default_topic: str, limit: int) -> list[dict]:
    items = raw.get("questions") if isinstance(raw, dict) else raw
    out: list[dict] = []
    for item in items or []:
        if not isinstance(item, dict) or not str(item.get("prompt", "")).strip():
            continue
        kind = str(item.get("type", "mcq")).lower().replace("-", "_")
        base = {
            "id": f"q_{len(out) + 1}",
            "prompt": str(item["prompt"]).strip(),
            "explanation": str(item.get("explanation", "")).strip(),
            "topic": str(item.get("topic") or default_topic).strip()[:60] or default_topic,
        }
        if kind == "mcq":
            options = [str(o).strip() for o in (item.get("options") or []) if str(o).strip()]
            idx = item.get("correctIndex", item.get("correct"))
            if len(options) < 2 or not isinstance(idx, int) or not 0 <= idx < len(options):
                continue
            out.append({**base, "type": "mcq", "options": options, "correctAnswer": idx})
        elif kind in ("true_false", "truefalse", "boolean"):
            val = item.get("correct", item.get("answer"))
            if isinstance(val, str):
                val = val.strip().lower() in ("true", "t", "yes")
            if not isinstance(val, bool):
                continue
            out.append({**base, "type": "true_false", "options": ["True", "False"], "correctAnswer": 0 if val else 1})
        else:
            ans = str(item.get("answer", "")).strip()
            if not ans:
                continue
            out.append({**base, "type": "short_answer", "correctAnswer": ans})
        if len(out) >= limit:
            break
    return out


def quiz_row_to_dict(row: dict) -> dict:
    q = {
        "id": row["id"], "workspaceId": row["workspace_id"], "title": row["title"], "topic": row["topic"],
        "difficulty": row["difficulty"], "timedMinutes": row["timed_minutes"],
        "questions": db.jload(row["questions"], []), "createdAt": row["created_at"],
    }
    if row.get("completed_at"):
        q["completedAt"] = row["completed_at"]
        q["scorePercent"] = row["score_percent"]
        q["attempts"] = db.jload(row["attempts"], [])
    return q


async def generate_quiz(user_id: str, p: dict, alias: str = "auto") -> dict:
    count = max(3, min(int(p.get("count", 5)), 15))
    topic = (p.get("topic") or "").strip()
    text, _ = await gather_context(user_id, p["workspaceId"], doc_id=p.get("documentId"), topic=topic)
    system = (
        "You write exam questions strictly from the provided study material. Never ask about anything not in the material.\n"
        f"Difficulty: {p.get('difficulty', 'medium')}. Write exactly {count} questions: mostly multiple choice "
        "(4 options, one correct), a few true/false, and 1-2 short answer.\n"
        'Return ONLY JSON: {"questions":[{"type":"mcq","prompt":"...","options":["..","..","..",".."],"correctIndex":0,'
        '"explanation":"why, in 1-2 sentences","topic":"short topic name"},'
        '{"type":"true_false","prompt":"...","correct":true,"explanation":"...","topic":"..."},'
        '{"type":"short_answer","prompt":"...","answer":"model answer in one sentence","explanation":"...","topic":"..."}]}\n'
        "Vary the position of the correct option. Use LaTeX ($...$) for math."
    )
    raw = await llm.complete_json(
        [{"role": "system", "content": system},
         {"role": "user", "content": f"Focus: {topic or 'whole material'}\n\nMATERIAL:\n{text}"}],
        alias=alias, max_tokens=min(7000, 350 * count + 600),
    )
    questions = normalize_questions(raw, topic or "General", count)
    if len(questions) < 2:
        raise AppError("The AI could not write a usable quiz from this material. Try again or pick another topic.",
                       code="generation_failed", status_code=502)
    quiz_id = db.new_id()
    title = f"{topic} quiz" if topic else "Quiz on your documents"
    db.run(
        "INSERT INTO quizzes(id,user_id,workspace_id,title,topic,difficulty,timed_minutes,questions,created_at) "
        "VALUES(?,?,?,?,?,?,?,?,?)",
        (quiz_id, user_id, p["workspaceId"], title[:120], topic or "General", p.get("difficulty", "medium"),
         p.get("timedMinutes"), db.jdump(questions), db.now_iso()),
    )
    return quiz_row_to_dict(db.one("SELECT * FROM quizzes WHERE id=?", (quiz_id,)))


def _keyword_score(answer: str, model: str) -> int:
    from .rerank import tokens

    want = tokens(model)
    if not want:
        return 0
    return int(round(100 * len(want & tokens(answer)) / len(want)))


async def submit_quiz(user_id: str, quiz_id: str, answers: list[dict], alias: str = "auto") -> dict:
    row = db.one("SELECT * FROM quizzes WHERE id=? AND user_id=?", (quiz_id, user_id))
    if not row:
        raise NotFoundError("Quiz not found.")
    questions = db.jload(row["questions"], [])
    given = {a["questionId"]: a.get("answer") for a in answers}

    shorts = [q for q in questions if q["type"] == "short_answer" and str(given.get(q["id"], "")).strip()]
    graded: dict[str, dict] = {}
    if shorts:
        try:
            payload = [{"id": q["id"], "question": q["prompt"], "model_answer": q["correctAnswer"],
                        "student_answer": str(given[q["id"]])[:800]} for q in shorts]
            res = await llm.complete_json(
                [{"role": "system", "content": 'Grade each short answer 0-100 against the model answer (credit correct ideas, not exact wording). '
                  'Return ONLY JSON: {"grades":[{"id":"..","score":0,"feedback":"one helpful sentence"}]}'},
                 {"role": "user", "content": llm_json(payload)}], alias=alias, max_tokens=1200)
            for g in (res.get("grades") if isinstance(res, dict) else res) or []:
                graded[str(g.get("id"))] = {"score": max(0, min(100, int(g.get("score", 0)))), "feedback": str(g.get("feedback", ""))}
        except Exception:  # noqa: BLE001
            log.warning("AI grading unavailable, using keyword match for short answers")
    attempts, correct = [], 0
    for q in questions:
        ans = given.get(q["id"])
        item: dict[str, Any] = {"questionId": q["id"], "userAnswer": ans if ans is not None else ""}
        if q["type"] == "short_answer":
            g = graded.get(q["id"])
            score = g["score"] if g else (_keyword_score(str(ans or ""), q["correctAnswer"]) if str(ans or "").strip() else 0)
            ok = score >= 60
            item.update(isCorrect=ok, aiGradedScore=score,
                        aiFeedback=(g or {}).get("feedback") or (q["explanation"] or f"Model answer: {q['correctAnswer']}"))
        else:
            ok = _is_num(ans) and int(float(ans)) == q["correctAnswer"]
            item.update(isCorrect=ok, aiFeedback=("Correct. " if ok else "") + q["explanation"])
        correct += 1 if item["isCorrect"] else 0
        attempts.append(item)
    score = int(round(100 * correct / max(len(questions), 1)))
    db.run("UPDATE quizzes SET completed_at=?, score_percent=?, attempts=? WHERE id=?",
           (db.now_iso(), score, db.jdump(attempts), quiz_id))
    return {"scorePercent": score, "attempts": attempts}


def _is_num(v: Any) -> bool:
    try:
        float(v)
        return v is not None and str(v).strip() != ""
    except (TypeError, ValueError):
        return False


def llm_json(obj: Any) -> str:
    return db.jdump(obj)


# ---------------------------------------------------------------------------
# Weak topics (computed from real quiz attempts)
# ---------------------------------------------------------------------------
def weak_topics(user_id: str, workspace_id: str, threshold: int = 75) -> list[dict]:
    rows = db.query(
        "SELECT * FROM quizzes WHERE user_id=? AND workspace_id=? AND completed_at IS NOT NULL ORDER BY completed_at",
        (user_id, workspace_id),
    )
    per_topic: dict[str, list[tuple[str, bool, str]]] = {}
    for row in rows:
        qmap = {q["id"]: q for q in db.jload(row["questions"], [])}
        for a in db.jload(row["attempts"], []):
            q = qmap.get(a["questionId"])
            if q:
                per_topic.setdefault(q["topic"], []).append((row["completed_at"], bool(a["isCorrect"]), row["topic"]))
    out = []
    for topic, items in per_topic.items():
        acc = round(100 * sum(1 for _, ok, _ in items if ok) / len(items))
        if acc >= threshold:
            continue
        half = len(items) // 2
        trend = "stagnant"
        if half:
            old = sum(1 for _, ok, _ in items[:half] if ok) / half
            new = sum(1 for _, ok, _ in items[half:] if ok) / (len(items) - half)
            trend = "improving" if new - old > 0.1 else "declining" if old - new > 0.1 else "stagnant"
        out.append({
            "id": f"wt_{_slug(topic)}", "workspaceId": workspace_id, "name": topic, "category": items[-1][2],
            "accuracyPercent": acc, "trend": trend, "lastPracticed": items[-1][0],
            "suggestedAction": "explain" if acc < 40 else "flashcards" if acc < 60 else "quiz",
        })
    return sorted(out, key=lambda t: t["accuracyPercent"])


def topic_mastery(user_id: str, workspace_id: str) -> list[dict]:
    """Per-topic accuracy for the dashboard radar (all topics, not just weak ones)."""
    rows = db.query(
        "SELECT questions, attempts FROM quizzes WHERE user_id=? AND workspace_id=? AND completed_at IS NOT NULL",
        (user_id, workspace_id),
    )
    acc: dict[str, list[bool]] = {}
    for row in rows:
        qmap = {q["id"]: q for q in db.jload(row["questions"], [])}
        for a in db.jload(row["attempts"], []):
            if a["questionId"] in qmap:
                acc.setdefault(qmap[a["questionId"]]["topic"], []).append(bool(a["isCorrect"]))
    return [{"topic": t, "accuracy": round(100 * sum(v) / len(v)), "attempts": len(v)} for t, v in acc.items()]


# ---------------------------------------------------------------------------
# Flashcards + SM-2
# ---------------------------------------------------------------------------
def sm2(repetition: int, interval: int, ease: float, rating: int, today: datetime | None = None) -> dict:
    """SuperMemo-2, identical to src/lib/sm2.ts (rating 1 Again, 2 Hard, 3 Good, 4 Easy)."""
    q = {1: 1, 2: 3, 3: 4, 4: 5}[rating]
    ease = ease or 2.5
    if q >= 3:
        interval = 1 if repetition == 0 else 6 if repetition == 1 else int(math.floor(interval * ease + 0.5))
        repetition += 1
    else:
        repetition, interval = 0, 1
    ease = max(1.3, round(ease + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02), 2))
    due = (today or datetime.now(UTC)) + timedelta(days=interval)
    return {"repetition": repetition, "interval": interval, "easeFactor": ease, "dueDate": due.isoformat()}


def card_to_dict(c: dict) -> dict:
    return {
        "id": c["id"], "deckId": c["deck_id"], "front": c["front"], "back": c["back"], "topic": c["topic"],
        "sm2": {"repetition": c["repetition"], "interval": c["interval"], "easeFactor": c["ease_factor"]},
        "dueDate": c["due_date"], "createdAt": c["created_at"],
    }


def deck_to_dict(deck: dict) -> dict:
    cards = [card_to_dict(c) for c in db.query("SELECT * FROM cards WHERE deck_id=? ORDER BY created_at, rowid", (deck["id"],))]
    now = datetime.now(UTC).isoformat()
    return {
        "id": deck["id"], "workspaceId": deck["workspace_id"], "title": deck["title"], "description": deck["description"],
        "cardCount": len(cards), "dueCount": sum(1 for c in cards if c["dueDate"] <= now),
        "cards": cards, "createdAt": deck["created_at"],
    }


def list_decks(user_id: str, workspace_id: str) -> list[dict]:
    return [deck_to_dict(d) for d in db.query(
        "SELECT * FROM decks WHERE user_id=? AND workspace_id=? ORDER BY created_at DESC", (user_id, workspace_id))]


def _insert_deck(user_id: str, workspace_id: str, title: str, description: str, cards: list[dict], source_doc: str | None) -> dict:
    deck_id, now = db.new_id(), db.now_iso()
    stmts = [("INSERT INTO decks(id,user_id,workspace_id,title,description,source_doc_id,created_at) VALUES(?,?,?,?,?,?,?)",
              (deck_id, user_id, workspace_id, title[:120], description, source_doc, now))]
    for c in cards:
        stmts.append(("INSERT INTO cards(id,deck_id,user_id,front,back,topic,due_date,created_at) VALUES(?,?,?,?,?,?,?,?)",
                      (db.new_id(), deck_id, user_id, c["front"], c["back"], c.get("topic"), now, now)))
    db.run_many(stmts)
    return deck_to_dict(db.one("SELECT * FROM decks WHERE id=?", (deck_id,)))


async def generate_deck(user_id: str, workspace_id: str, doc_id: str | None, title: str, count: int = 12, alias: str = "auto") -> dict:
    count = max(4, min(count, 25))
    text, docs = await gather_context(user_id, workspace_id, doc_id=doc_id, topic=title)
    system = (
        f"Write {count} flashcards from the study material. One fact or idea per card; the front is a clear question or term, "
        "the back a short precise answer. Only use the material. Use LaTeX ($...$) for math.\n"
        'Return ONLY JSON: {"cards":[{"front":"...","back":"...","topic":"short topic"}]}'
    )
    raw = await llm.complete_json(
        [{"role": "system", "content": system}, {"role": "user", "content": f"Focus: {title or 'whole material'}\n\nMATERIAL:\n{text}"}],
        alias=alias, max_tokens=min(6000, 160 * count + 500))
    items = raw.get("cards") if isinstance(raw, dict) else raw
    cards = [{"front": str(c["front"]).strip(), "back": str(c["back"]).strip(), "topic": str(c.get("topic", "")).strip()[:60] or None}
             for c in (items or []) if isinstance(c, dict) and str(c.get("front", "")).strip() and str(c.get("back", "")).strip()]
    if len(cards) < 2:
        raise AppError("The AI could not write usable flashcards from this material.", code="generation_failed", status_code=502)
    name = title.strip() or f"{docs[0]['name']} flashcards"
    return _insert_deck(user_id, workspace_id, name, f"Generated from {docs[0]['name'] if len(docs) == 1 else 'your workspace documents'}", cards[:count], doc_id)


def rate_card(user_id: str, deck_id: str, card_id: str, rating: int) -> dict:
    card = db.one("SELECT * FROM cards WHERE id=? AND deck_id=? AND user_id=?", (card_id, deck_id, user_id))
    if not card:
        raise NotFoundError("Card not found.")
    n = sm2(card["repetition"], card["interval"], card["ease_factor"], rating)
    db.run("UPDATE cards SET repetition=?, interval=?, ease_factor=?, due_date=? WHERE id=?",
           (n["repetition"], n["interval"], n["easeFactor"], n["dueDate"], card_id))
    return deck_to_dict(db.one("SELECT * FROM decks WHERE id=?", (deck_id,)))


def add_card(user_id: str, deck_id: str, front: str, back: str) -> dict:
    deck = db.one("SELECT * FROM decks WHERE id=? AND user_id=?", (deck_id, user_id))
    if not deck:
        raise NotFoundError("Deck not found.")
    now = db.now_iso()
    db.run("INSERT INTO cards(id,deck_id,user_id,front,back,due_date,created_at) VALUES(?,?,?,?,?,?,?)",
           (db.new_id(), deck_id, user_id, front.strip(), back.strip(), now, now))
    return deck_to_dict(deck)


def deck_from_mistakes(user_id: str, quiz_id: str) -> dict:
    row = db.one("SELECT * FROM quizzes WHERE id=? AND user_id=? AND completed_at IS NOT NULL", (quiz_id, user_id))
    if not row:
        raise NotFoundError("Finish the quiz first.")
    qmap = {q["id"]: q for q in db.jload(row["questions"], [])}
    cards = []
    for a in db.jload(row["attempts"], []):
        q = qmap.get(a["questionId"])
        if not q or a["isCorrect"]:
            continue
        ans = q["options"][q["correctAnswer"]] if q["type"] != "short_answer" else q["correctAnswer"]
        cards.append({"front": q["prompt"], "back": f"{ans}\n\n{q['explanation']}".strip(), "topic": q["topic"]})
    if not cards:
        raise AppError("You answered everything correctly, so there is nothing to review.", code="nothing_to_review", status_code=422)
    return _insert_deck(user_id, row["workspace_id"], f"Review: {row['title']}", "Cards from questions you missed", cards, None)


# ---------------------------------------------------------------------------
# Study plan (deterministic, built from the student's real documents and weak topics)
# ---------------------------------------------------------------------------
def _task(plan_id: str, day: int, d: date, title: str, kind: str, minutes: int, topic: str, n: int) -> dict:
    return {"id": f"t{day}_{n}", "planId": plan_id, "dayIndex": day, "date": d.isoformat(), "title": title, "type": kind,
            "durationMinutes": minutes, "isCompleted": False, "topic": topic}


def build_plan(user_id: str, workspace_id: str, exam_date: str, daily_hours: float, weak_first: bool) -> dict:
    today = datetime.now(UTC).date()
    try:
        end = date.fromisoformat(exam_date[:10])
    except ValueError:
        raise AppError("Enter a valid exam date.", code="validation_error", status_code=422) from None
    if end < today:
        raise AppError("The exam date is in the past.", code="validation_error", status_code=422)
    weak = [w["name"] for w in weak_topics(user_id, workspace_id)]
    docs = [d["name"].rsplit(".", 1)[0] for d in db.query(
        "SELECT name FROM documents WHERE user_id=? AND workspace_id=? AND status='ready' ORDER BY created_at", (user_id, workspace_id))]
    topics = (weak if weak_first else []) + [d for d in docs if d not in weak] + ([] if weak_first else weak)
    plan_id = f"plan_{workspace_id}"
    tasks: list[dict] = []
    if topics:
        days = max(1, min((end - today).days + 1, 30))
        budget = max(30, int(daily_hours * 60))
        for i in range(days):
            d = today + timedelta(days=i)
            topic = topics[i % len(topics)]
            is_weak = topic in weak
            read = max(15, int(budget * 0.4))
            quiz = max(10, int(budget * 0.3))
            rest = max(10, budget - read - quiz)
            tasks += [
                _task(plan_id, i + 1, d, f"Read and note key ideas: {topic}", "read", read, topic, 1),
                _task(plan_id, i + 1, d, f"Take a practice quiz on {topic}", "quiz", quiz, topic, 2),
                _task(plan_id, i + 1, d, "Review due flashcards" if i % 2 == 0 else f"Revise {'your weak spots in ' if is_weak else ''}{topic}",
                      "flashcards" if i % 2 == 0 else "revise", rest, topic, 3),
            ]
    plan = {"id": plan_id, "workspaceId": workspace_id, "title": "Exam readiness plan", "targetExamDate": end.isoformat(),
            "dailyHours": daily_hours, "weakTopicPriority": weak_first, "tasks": tasks, "completionRate": 0,
            "createdAt": db.now_iso()}
    db.run("INSERT INTO plans(user_id,workspace_id,data,updated_at) VALUES(?,?,?,?) "
           "ON CONFLICT(user_id,workspace_id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at",
           (user_id, workspace_id, db.jdump(plan), db.now_iso()))
    return plan


def get_plan(user_id: str, workspace_id: str) -> dict | None:
    row = db.one("SELECT data FROM plans WHERE user_id=? AND workspace_id=?", (user_id, workspace_id))
    return _with_rate(db.jload(row["data"])) if row else None


def _with_rate(plan: dict) -> dict:
    tasks = plan.get("tasks", [])
    plan["completionRate"] = round(100 * sum(1 for t in tasks if t["isCompleted"]) / len(tasks)) if tasks else 0
    return plan


def _save_plan(user_id: str, workspace_id: str, plan: dict) -> dict:
    plan = _with_rate(plan)
    db.run("UPDATE plans SET data=?, updated_at=? WHERE user_id=? AND workspace_id=?",
           (db.jdump(plan), db.now_iso(), user_id, workspace_id))
    return plan


def set_task_done(user_id: str, workspace_id: str, task_id: str, done: bool) -> dict:
    plan = get_plan(user_id, workspace_id)
    if not plan:
        raise NotFoundError("No study plan yet.")
    hit = next((t for t in plan["tasks"] if t["id"] == task_id), None)
    if not hit:
        raise NotFoundError("Task not found.")
    hit["isCompleted"] = done
    return _save_plan(user_id, workspace_id, plan)


def reschedule_missed(user_id: str, workspace_id: str) -> dict:
    plan = get_plan(user_id, workspace_id)
    if not plan:
        raise NotFoundError("No study plan yet.")
    today = datetime.now(UTC).date().isoformat()
    for t in plan["tasks"]:
        if not t["isCompleted"] and t["date"] < today:
            t["date"] = today
    return _save_plan(user_id, workspace_id, plan)


# ---------------------------------------------------------------------------
# Mind map
# ---------------------------------------------------------------------------
def _trim_tree(node: Any, depth: int = 0) -> dict | None:
    if not isinstance(node, dict) or not str(node.get("label", "")).strip():
        return None
    kids = [] if depth >= 2 else [k for k in (_trim_tree(c, depth + 1) for c in (node.get("children") or [])[:6]) if k]
    return {"label": str(node["label"]).strip()[:60], "summary": str(node.get("summary", "")).strip()[:240], "children": kids}


async def generate_mindmap(user_id: str, doc_id: str, alias: str = "auto") -> dict:
    doc = db.one("SELECT * FROM documents WHERE id=? AND user_id=?", (doc_id, user_id))
    if not doc:
        raise NotFoundError("Document not found.")
    text, _ = await gather_context(user_id, doc["workspace_id"], doc_id=doc_id, max_chars=10000)
    raw = await llm.complete_json(
        [{"role": "system", "content": "Build a mind map of the document: one root, 4-7 main branches, each with 2-5 sub-points. "
          "Use only the document. Labels are 1-5 words; summaries are one sentence.\n"
          'Return ONLY JSON: {"label":"root","summary":"...","children":[{"label":"..","summary":"..","children":[{"label":"..","summary":"..","children":[]}]}]}'},
         {"role": "user", "content": f"DOCUMENT ({doc['name']}):\n{text}"}], alias=alias, max_tokens=2500)
    tree = _trim_tree(raw)
    if not tree or not tree["children"]:
        raise AppError("The AI could not build a mind map from this document.", code="generation_failed", status_code=502)
    return {"documentId": doc_id, "documentName": doc["name"], "root": tree}


# ---------------------------------------------------------------------------
# Career tools (resume / job description supplied by the user)
# ---------------------------------------------------------------------------
def _clamp(v: Any, lo: int = 0, hi: int = 100) -> int:
    try:
        return max(lo, min(hi, int(round(float(v)))))
    except (TypeError, ValueError):
        return 0


def _list_of(v: Any, keys: dict[str, Any]) -> list[dict]:
    out = []
    for item in v or []:
        if isinstance(item, dict) and str(item.get("name", item.get("item", item.get("section", "")))).strip():
            out.append({k: (item.get(k) if item.get(k) not in (None, "") else d) for k, d in keys.items()})
    return out


async def analyze_skill_gap(resume: str, jd: str, alias: str = "auto") -> dict:
    system = (
        "You are a strict ATS and hiring-skills analyst. Compare the RESUME to the JOB DESCRIPTION. Only report skills and evidence "
        "that appear in the resume text; never invent experience. Scores are integers 0-100.\n"
        'Return ONLY JSON: {"jobTitle":"","companyName":"","overallMatchScore":0,'
        '"matchedSkills":[{"name":"","evidence":"quote or paraphrase from the resume"}],'
        '"partialSkills":[{"name":"","gap":"what is missing"}],'
        '"missingSkills":[{"name":"","priority":"high|medium|low","recommendedResource":"specific free resource or project idea"}],'
        '"atsChecklist":[{"item":"","passed":true,"tip":""}],'
        '"resumeScoreBreakdown":{"impact":0,"clarity":0,"keywords":0,"formatting":0,"quantification":0},'
        '"sectionSuggestions":[{"section":"","suggestion":""}]}'
    )
    raw = await llm.complete_json(
        [{"role": "system", "content": system},
         {"role": "user", "content": f"RESUME:\n{resume[:9000]}\n\nJOB DESCRIPTION:\n{jd[:6000]}"}], alias=alias, max_tokens=3000)
    if not isinstance(raw, dict):
        raise AppError("The AI returned an unreadable analysis.", code="generation_failed", status_code=502)
    b = raw.get("resumeScoreBreakdown") or {}
    return {
        "id": db.new_id(), "jobTitle": str(raw.get("jobTitle") or "Target role"), "companyName": str(raw.get("companyName") or ""),
        "overallMatchScore": _clamp(raw.get("overallMatchScore")),
        "matchedSkills": _list_of(raw.get("matchedSkills"), {"name": "", "evidence": ""}),
        "partialSkills": _list_of(raw.get("partialSkills"), {"name": "", "gap": ""}),
        "missingSkills": [{**s, "priority": s["priority"] if s["priority"] in ("high", "medium", "low") else "medium"}
                          for s in _list_of(raw.get("missingSkills"), {"name": "", "priority": "medium", "recommendedResource": ""})],
        "atsChecklist": [{"item": c["item"], "passed": bool(c["passed"]), "tip": str(c["tip"])}
                         for c in _list_of(raw.get("atsChecklist"), {"item": "", "passed": False, "tip": ""})],
        "resumeScoreBreakdown": {k: _clamp(b.get(k)) for k in ("impact", "clarity", "keywords", "formatting", "quantification")},
        "sectionSuggestions": _list_of(raw.get("sectionSuggestions"), {"section": "", "suggestion": ""}),
    }


async def rewrite_bullet(bullet: str, mode: str, alias: str = "auto") -> dict:
    goal = ("Make it concise and punchy without losing facts." if mode == "concise"
            else "Make it quantified. If the original has no numbers, use clearly marked placeholders like [X%] or [N users] - never invent real figures.")
    raw = await llm.complete_json(
        [{"role": "system", "content": f"Rewrite one resume bullet. Start with a strong action verb. {goal}\n"
          'Return ONLY JSON: {"improved":"","diffSummary":"what changed, one sentence","quantificationScore":0,"metricAdded":"the metric or placeholder added, or none"}'},
         {"role": "user", "content": bullet[:600]}], alias=alias, max_tokens=500)
    if not isinstance(raw, dict) or not str(raw.get("improved", "")).strip():
        raise AppError("The AI could not rewrite that bullet.", code="generation_failed", status_code=502)
    return {"id": db.new_id(), "original": bullet, "improved": str(raw["improved"]).strip(),
            "diffSummary": str(raw.get("diffSummary", "")), "quantificationScore": _clamp(raw.get("quantificationScore")),
            "metricAdded": str(raw.get("metricAdded", "none"))}


async def build_roadmap(resume: str, jd: str, alias: str = "auto") -> list[dict]:
    raw = await llm.complete_json(
        [{"role": "system", "content": "Create a realistic 4-6 week learning roadmap that closes the gap between the RESUME and the JOB DESCRIPTION. "
          'Return ONLY JSON: {"milestones":[{"week":1,"title":"","description":"","estimatedHours":6,"skillsGained":[""],'
          '"resources":[{"name":"","type":"doc|course|practice"}]}]}. Do not include URLs.'},
         {"role": "user", "content": f"RESUME:\n{resume[:6000]}\n\nJOB DESCRIPTION:\n{jd[:4000]}"}], alias=alias, max_tokens=2500)
    items = raw.get("milestones") if isinstance(raw, dict) else raw
    out = []
    for i, m in enumerate(items or [], start=1):
        if isinstance(m, dict) and str(m.get("title", "")).strip():
            out.append({"id": f"ms_{i}", "week": _clamp(m.get("week", i), 1, 52), "title": str(m["title"]), "description": str(m.get("description", "")),
                        "estimatedHours": _clamp(m.get("estimatedHours", 5), 1, 80), "isCompleted": False,
                        "skillsGained": [str(s) for s in (m.get("skillsGained") or [])][:6],
                        "resources": [{"name": str(r.get("name", "")), "type": r.get("type") if r.get("type") in ("doc", "course", "practice") else "doc"}
                                      for r in (m.get("resources") or []) if isinstance(r, dict) and r.get("name")][:4]})
    return out


async def interview_questions(resume: str, jd: str, alias: str = "auto") -> list[dict]:
    raw = await llm.complete_json(
        [{"role": "system", "content": "Write 6 interview questions for this candidate and role: a mix of technical and behavioral, based on the job description and gaps in the resume. "
          'Return ONLY JSON: {"questions":[{"prompt":"","type":"technical|behavioral|mixed","expectedKeywords":["",""]}]}'},
         {"role": "user", "content": f"RESUME:\n{resume[:5000]}\n\nJOB DESCRIPTION:\n{jd[:4000]}"}], alias=alias, max_tokens=1800)
    items = raw.get("questions") if isinstance(raw, dict) else raw
    return [{"id": f"iq_{i}", "prompt": str(q["prompt"]), "type": q.get("type") if q.get("type") in ("technical", "behavioral", "mixed") else "mixed",
             "source": "JD", "expectedKeywords": [str(k) for k in (q.get("expectedKeywords") or [])][:6]}
            for i, q in enumerate(items or [], start=1) if isinstance(q, dict) and str(q.get("prompt", "")).strip()]


FILLERS = ["um", "uh", "like", "you know", "basically", "actually", "sort of", "kind of"]


def speech_stats(transcript: str, duration_seconds: float) -> dict:
    words = transcript.split()
    lower = transcript.lower()
    found, total = [], 0
    for f in FILLERS:
        n = len(re.findall(rf"\b{re.escape(f)}\b", lower))
        if n:
            total += n
            found.append(f"{f} ({n}x)")
    wpm = int(round(len(words) / duration_seconds * 60)) if duration_seconds > 0 else 0
    return {"fillerCount": total, "fillerWords": found, "speakingPaceWpm": wpm}


async def evaluate_interview(question: str, transcript: str, duration_seconds: float, alias: str = "auto") -> dict:
    stats = speech_stats(transcript, duration_seconds)
    raw = await llm.complete_json(
        [{"role": "system", "content": "You are an interview coach. Grade the candidate's answer honestly. Scores are integers 0-100. "
          'Return ONLY JSON: {"rubric":{"clarity":0,"depth":0,"structure":0,"confidence":0},"strengths":[""],"improvements":[""],"modelAnswer":"a strong sample answer"}'},
         {"role": "user", "content": f"QUESTION: {question}\n\nANSWER (speech transcript):\n{transcript[:4000]}"}], alias=alias, max_tokens=1500)
    r = (raw.get("rubric") if isinstance(raw, dict) else None) or {}
    return {"rubric": {k: _clamp(r.get(k)) for k in ("clarity", "depth", "structure", "confidence")}, **stats,
            "strengths": [str(s) for s in (raw.get("strengths") or [])][:5] if isinstance(raw, dict) else [],
            "improvements": [str(s) for s in (raw.get("improvements") or [])][:5] if isinstance(raw, dict) else [],
            "modelAnswer": str(raw.get("modelAnswer", "")) if isinstance(raw, dict) else ""}
