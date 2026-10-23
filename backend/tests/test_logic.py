"""Fast logic tests (no network, no model download): python -m pytest -q"""
import asyncio
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import db, llm, loaders, rerank, study  # noqa: E402


class FakeStore:
    def get_chunks(self, doc_id, user_id):
        return [{"text": f"chunk {i} about locks", "chunk": i} for i in range(5)]

    def search(self, q, k, **kw):
        return [{"text": "strict 2PL holds locks", "vector_score": 0.6, "score": 0.6}]


@pytest.fixture(autouse=True)
def fresh_db(tmp_path, monkeypatch):
    db.reset_for_tests(str(tmp_path))
    monkeypatch.setattr(study, "get_store", lambda: FakeStore())
    db.run("INSERT INTO documents(id,user_id,workspace_id,name,type,status,created_at) VALUES('d1','u1','w1','Notes.pdf','pdf','ready',?)", (db.now_iso(),))


def test_split_text_respects_size_and_progresses():
    chunks = loaders.split_text("word " * 2000, 900, 150)
    assert chunks and all(len(c) <= 900 for c in chunks)
    assert loaders.split_text("tiny", 900, 150) == ["tiny"]


def test_private_urls_blocked():
    for url in ("http://127.0.0.1/", "http://localhost/", "ftp://example.com"):
        with pytest.raises(loaders.IngestError):
            loaders.check_public_url(url)


def test_rerank_prefers_keyword_match():
    hits = [{"text": "photosynthesis", "vector_score": 0.5}, {"text": "strict 2PL locks", "vector_score": 0.5}]
    assert rerank.rerank("strict 2PL locks", hits, 1)[0]["text"] == "strict 2PL locks"


def test_sm2_progression():
    assert study.sm2(0, 0, 2.5, 3)["interval"] == 1
    assert study.sm2(1, 1, 2.5, 3)["interval"] == 6
    assert study.sm2(2, 6, 2.5, 3)["interval"] == 15
    again = study.sm2(3, 15, 2.5, 1)
    assert again["repetition"] == 0 and again["easeFactor"] == 1.96


def test_quiz_flow_weak_topics_and_plan(monkeypatch):
    async def fake_json(messages, **k):
        sys_msg = messages[0]["content"]
        if "exam questions" in sys_msg:
            return {"questions": [
                {"type": "mcq", "prompt": "Q1", "options": ["a", "b", "c", "d"], "correctIndex": 2, "explanation": "e", "topic": "Locks"},
                {"type": "true_false", "prompt": "Q2", "correct": False, "explanation": "e", "topic": "Locks"},
                {"type": "mcq", "prompt": "broken", "options": ["only"], "correctIndex": 0},
            ]}
        return {"grades": []}

    monkeypatch.setattr(llm, "complete_json", fake_json)
    quiz = asyncio.run(study.generate_quiz("u1", {"workspaceId": "w1", "topic": "Locks", "count": 3}))
    assert len(quiz["questions"]) == 2
    res = asyncio.run(study.submit_quiz("u1", quiz["id"], [{"questionId": "q_1", "answer": 2}, {"questionId": "q_2", "answer": 0}]))
    assert res["scorePercent"] == 50
    weak = study.weak_topics("u1", "w1")
    assert weak and weak[0]["name"] == "Locks" and weak[0]["accuracyPercent"] == 50
    deck = study.deck_from_mistakes("u1", quiz["id"])
    assert deck["cardCount"] == 1
    exam = (datetime.now(UTC).date() + timedelta(days=4)).isoformat()
    plan = study.build_plan("u1", "w1", exam, 2, True)
    assert plan["tasks"] and plan["tasks"][0]["topic"] == "Locks"
    assert study.set_task_done("u1", "w1", "t1_1", True)["completionRate"] > 0


def test_other_users_cannot_read_a_quiz():
    db.run("INSERT INTO quizzes(id,user_id,workspace_id,title,topic,difficulty,questions,created_at) VALUES('x','u1','w1','t','t','easy','[]',?)", (db.now_iso(),))
    with pytest.raises(Exception):
        asyncio.run(study.submit_quiz("intruder", "x", []))
