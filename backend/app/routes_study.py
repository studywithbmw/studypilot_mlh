"""Summaries, quizzes, flashcards, weak topics, study plan, mind map, career, dashboard."""
import json
from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from . import db, study
from .auth import AuthUser, current_user
from .routes_core import count_ai_call, has_workspace, owned_workspace

router = APIRouter()


class In(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="ignore")


class SummaryIn(In):
    level: Literal["short", "detailed", "bullet", "terms"] = "detailed"


class QuizIn(In):
    workspace_id: str
    topic: str = Field(default="", max_length=120)
    difficulty: Literal["easy", "medium", "hard"] = "medium"
    count: int = Field(default=5, ge=3, le=15)
    timed_minutes: int | None = Field(default=None, ge=1, le=180)
    document_id: str | None = None


class AnswerIn(In):
    question_id: str
    answer: str | int | float | None = None


class SubmitIn(In):
    answers: list[AnswerIn]


class DeckIn(In):
    workspace_id: str
    document_id: str | None = None
    topic: str = Field(default="", max_length=120)
    count: int = Field(default=12, ge=4, le=25)


class RateIn(In):
    rating: int = Field(ge=1, le=4)


class CardIn(In):
    front: str = Field(min_length=1, max_length=1000)
    back: str = Field(min_length=1, max_length=2000)


class PlanIn(In):
    target_exam_date: str
    daily_hours: float = Field(default=2, ge=0.5, le=12)
    weak_topic_priority: bool = True


class TaskIn(In):
    is_completed: bool


class CareerIn(In):
    resume_text: str = Field(min_length=40, max_length=20000)
    jd_text: str = Field(min_length=40, max_length=12000)


class BulletIn(In):
    bullet: str = Field(min_length=5, max_length=600)
    mode: Literal["concise", "quantified"] = "quantified"


class InterviewIn(In):
    question: str = Field(min_length=3, max_length=600)
    transcript: str = Field(min_length=3, max_length=6000)
    duration_seconds: float = Field(default=60, ge=1, le=3600)


def _doc_owned(user_id: str, doc_id: str) -> dict:
    from .errors import NotFoundError

    row = db.one("SELECT * FROM documents WHERE id=? AND user_id=?", (doc_id, user_id))
    if not row:
        raise NotFoundError("Document not found.")
    return row


# --- summaries / mind map ------------------------------------------------
def _save_note(user_id: str, doc: dict, kind: str, level: str, title: str, content: str) -> tuple[str, str]:
    """One saved note per (document, kind, level): regenerating replaces the old copy."""
    db.run("DELETE FROM saved_notes WHERE user_id=? AND document_id=? AND kind=? AND level=?",
           (user_id, doc["id"], kind, level))
    nid, now = db.new_id(), db.now_iso()
    db.run("INSERT INTO saved_notes(id,user_id,workspace_id,document_id,kind,level,title,content,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
           (nid, user_id, doc["workspace_id"], doc["id"], kind, level, title, content, now))
    return nid, now


@router.post("/documents/{doc_id}/summary")
async def summary(doc_id: str, body: SummaryIn, user: AuthUser = Depends(current_user)):
    doc = _doc_owned(user.user_id, doc_id)
    count_ai_call(user.user_id)
    result = await study.generate_summary(user.user_id, doc_id, body.level)
    result["id"], result["createdAt"] = _save_note(user.user_id, doc, "summary", body.level, result["title"], result["content"])
    return result


@router.post("/documents/{doc_id}/mindmap")
async def mindmap(doc_id: str, user: AuthUser = Depends(current_user)):
    doc = _doc_owned(user.user_id, doc_id)
    count_ai_call(user.user_id)
    result = await study.generate_mindmap(user.user_id, doc_id)
    result["id"], result["createdAt"] = _save_note(
        user.user_id, doc, "mindmap", "", f"{doc['name']} — mind map", json.dumps(result["root"], ensure_ascii=False))
    return result


@router.get("/workspaces/{workspace_id}/saved-notes")
def saved_notes(workspace_id: str, kind: Literal["summary", "mindmap"], user: AuthUser = Depends(current_user)):
    """Everything generated earlier, so it survives reloads, chat deletion and logouts."""
    if not has_workspace(user.user_id, workspace_id):
        return []
    out = []
    for r in db.query("SELECT * FROM saved_notes WHERE user_id=? AND workspace_id=? AND kind=? ORDER BY created_at DESC",
                      (user.user_id, workspace_id, kind)):
        if kind == "summary":
            out.append({"id": r["id"], "workspaceId": r["workspace_id"], "documentId": r["document_id"], "title": r["title"],
                        "level": r["level"], "content": r["content"], "citations": [], "createdAt": r["created_at"]})
        else:
            doc = db.one("SELECT name FROM documents WHERE id=?", (r["document_id"],))
            out.append({"id": r["id"], "documentId": r["document_id"],
                        "documentName": doc["name"] if doc else r["title"].removesuffix(" — mind map"),
                        "root": json.loads(r["content"]), "createdAt": r["created_at"]})
    return out


@router.delete("/saved-notes/{note_id}", status_code=204)
def delete_saved_note(note_id: str, user: AuthUser = Depends(current_user)):
    from .errors import NotFoundError

    if not db.run("DELETE FROM saved_notes WHERE id=? AND user_id=?", (note_id, user.user_id)):
        raise NotFoundError("Saved item not found.")
    return Response(status_code=204)


# --- quizzes ---------------------------------------------------------------
@router.get("/workspaces/{workspace_id}/quizzes")
def quizzes(workspace_id: str, user: AuthUser = Depends(current_user)):
    if not has_workspace(user.user_id, workspace_id):
        return []
    return [study.quiz_row_to_dict(r) for r in db.query(
        "SELECT * FROM quizzes WHERE user_id=? AND workspace_id=? ORDER BY created_at DESC", (user.user_id, workspace_id))]


@router.post("/quizzes", status_code=201)
async def new_quiz(body: QuizIn, user: AuthUser = Depends(current_user)):
    owned_workspace(user.user_id, body.workspace_id)
    count_ai_call(user.user_id)
    return await study.generate_quiz(user.user_id, {
        "workspaceId": body.workspace_id, "topic": body.topic, "difficulty": body.difficulty, "count": body.count,
        "timedMinutes": body.timed_minutes, "documentId": body.document_id})


@router.delete("/quizzes/{quiz_id}", status_code=204)
def delete_quiz(quiz_id: str, user: AuthUser = Depends(current_user)):
    from .errors import NotFoundError

    if not db.run("DELETE FROM quizzes WHERE id=? AND user_id=?", (quiz_id, user.user_id)):
        raise NotFoundError("Quiz not found.")
    return Response(status_code=204)


@router.post("/quizzes/{quiz_id}/submit")
async def submit(quiz_id: str, body: SubmitIn, user: AuthUser = Depends(current_user)):
    count_ai_call(user.user_id)
    return await study.submit_quiz(user.user_id, quiz_id, [{"questionId": a.question_id, "answer": a.answer} for a in body.answers])


@router.post("/quizzes/{quiz_id}/flashcards", status_code=201)
def mistakes_to_cards(quiz_id: str, user: AuthUser = Depends(current_user)):
    return study.deck_from_mistakes(user.user_id, quiz_id)


@router.get("/workspaces/{workspace_id}/weak-topics")
def weak(workspace_id: str, user: AuthUser = Depends(current_user)):
    if not has_workspace(user.user_id, workspace_id):
        return []
    return study.weak_topics(user.user_id, workspace_id)


# --- flashcards ------------------------------------------------------------
@router.get("/workspaces/{workspace_id}/decks")
def decks(workspace_id: str, user: AuthUser = Depends(current_user)):
    if not has_workspace(user.user_id, workspace_id):
        return []
    return study.list_decks(user.user_id, workspace_id)


@router.post("/decks", status_code=201)
async def new_deck(body: DeckIn, user: AuthUser = Depends(current_user)):
    owned_workspace(user.user_id, body.workspace_id)
    count_ai_call(user.user_id)
    return await study.generate_deck(user.user_id, body.workspace_id, body.document_id, body.topic, body.count)


@router.delete("/decks/{deck_id}", status_code=204)
def delete_deck(deck_id: str, user: AuthUser = Depends(current_user)):
    from .errors import NotFoundError

    if not db.one("SELECT id FROM decks WHERE id=? AND user_id=?", (deck_id, user.user_id)):
        raise NotFoundError("Deck not found.")
    db.run_many([("DELETE FROM cards WHERE deck_id=? AND user_id=?", (deck_id, user.user_id)),
                 ("DELETE FROM decks WHERE id=? AND user_id=?", (deck_id, user.user_id))])
    return Response(status_code=204)


@router.post("/decks/{deck_id}/cards/{card_id}/rate")
def rate(deck_id: str, card_id: str, body: RateIn, user: AuthUser = Depends(current_user)):
    return study.rate_card(user.user_id, deck_id, card_id, body.rating)


@router.post("/decks/{deck_id}/cards", status_code=201)
def add_card(deck_id: str, body: CardIn, user: AuthUser = Depends(current_user)):
    return study.add_card(user.user_id, deck_id, body.front, body.back)


# --- study plan --------------------------------------------------------------
@router.get("/workspaces/{workspace_id}/study-plan")
def get_plan(workspace_id: str, user: AuthUser = Depends(current_user)):
    if not has_workspace(user.user_id, workspace_id):
        return None
    return study.get_plan(user.user_id, workspace_id)  # null until the student creates one


@router.post("/workspaces/{workspace_id}/study-plan")
def make_plan(workspace_id: str, body: PlanIn, user: AuthUser = Depends(current_user)):
    owned_workspace(user.user_id, workspace_id)
    return study.build_plan(user.user_id, workspace_id, body.target_exam_date, body.daily_hours, body.weak_topic_priority)


@router.post("/workspaces/{workspace_id}/study-plan/reschedule")
def reschedule(workspace_id: str, user: AuthUser = Depends(current_user)):
    owned_workspace(user.user_id, workspace_id)
    return study.reschedule_missed(user.user_id, workspace_id)


@router.patch("/workspaces/{workspace_id}/study-plan/tasks/{task_id}")
def toggle_task(workspace_id: str, task_id: str, body: TaskIn, user: AuthUser = Depends(current_user)):
    owned_workspace(user.user_id, workspace_id)
    return study.set_task_done(user.user_id, workspace_id, task_id, body.is_completed)


# --- dashboard ---------------------------------------------------------------
@router.get("/workspaces/{workspace_id}/dashboard")
def dashboard(workspace_id: str, user: AuthUser = Depends(current_user)):
    if not has_workspace(user.user_id, workspace_id):
        return {"quizScores": [], "topicMastery": [], "weakTopics": [], "dueFlashcards": 0, "todaysTasks": []}
    uid = user.user_id
    quizzes_done = db.query(
        "SELECT title, score_percent, completed_at FROM quizzes WHERE user_id=? AND workspace_id=? AND completed_at IS NOT NULL "
        "ORDER BY completed_at DESC LIMIT 10", (uid, workspace_id))
    now = datetime.now(UTC).isoformat()
    due = db.one("SELECT COUNT(*) c FROM cards c JOIN decks d ON d.id=c.deck_id WHERE d.user_id=? AND d.workspace_id=? AND c.due_date<=?",
                 (uid, workspace_id, now))["c"]
    plan = study.get_plan(uid, workspace_id)
    today = now[:10]
    return {
        "quizScores": [{"label": q["title"], "score": q["score_percent"], "completedAt": q["completed_at"]} for q in reversed(quizzes_done)],
        "topicMastery": study.topic_mastery(uid, workspace_id),
        "weakTopics": study.weak_topics(uid, workspace_id)[:5],
        "dueFlashcards": due,
        "todaysTasks": [t for t in (plan or {}).get("tasks", []) if t["date"] == today],
    }


# --- career ------------------------------------------------------------------
@router.post("/career/skill-gap")
async def skill_gap(body: CareerIn, user: AuthUser = Depends(current_user)):
    count_ai_call(user.user_id)
    return await study.analyze_skill_gap(body.resume_text, body.jd_text)


@router.post("/career/rewrite-bullet")
async def rewrite(body: BulletIn, user: AuthUser = Depends(current_user)):
    count_ai_call(user.user_id)
    return await study.rewrite_bullet(body.bullet, body.mode)


@router.post("/career/roadmap")
async def roadmap(body: CareerIn, user: AuthUser = Depends(current_user)):
    count_ai_call(user.user_id)
    return await study.build_roadmap(body.resume_text, body.jd_text)


@router.post("/career/interview-questions")
async def iq(body: CareerIn, user: AuthUser = Depends(current_user)):
    count_ai_call(user.user_id)
    return await study.interview_questions(body.resume_text, body.jd_text)


@router.post("/career/interview-evaluate")
async def evaluate(body: InterviewIn, user: AuthUser = Depends(current_user)):
    count_ai_call(user.user_id)
    return await study.evaluate_interview(body.question, body.transcript, body.duration_seconds)