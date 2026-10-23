"""Exam Predictor maths and pipeline tests (no network, no model download).

python -m pytest -q backend/tests
"""
import asyncio
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import db, exam, llm  # noqa: E402


@pytest.fixture(autouse=True)
def fresh_db(tmp_path):
    db.reset_for_tests(str(tmp_path))


# ---------------------------------------------------------------------------
# Scoring maths
# ---------------------------------------------------------------------------
def test_empty_input_scores_nothing():
    assert exam.score_topics([], 2026) == []


def test_weights_are_the_documented_formula():
    assert exam.WEIGHT_FREQUENCY == 0.40
    assert exam.WEIGHT_RECENCY == 0.25
    assert exam.WEIGHT_MARKS == 0.20
    assert exam.WEIGHT_DUE_GAP == 0.15
    assert pytest.approx(1.0) == (
        exam.WEIGHT_FREQUENCY + exam.WEIGHT_RECENCY + exam.WEIGHT_MARKS + exam.WEIGHT_DUE_GAP
    )


def test_frequency_orders_repeated_topic_higher():
    questions = [
        {"topic": "Deadlocks", "year": 2024, "marks": 5},
        {"topic": "Deadlocks", "year": 2024, "marks": 5},
        {"topic": "Paging", "year": 2024, "marks": 5},
    ]
    scores = exam.score_topics(questions, 2026)
    assert [s.topic for s in scores] == ["Deadlocks", "Paging"]
    assert scores[0].times_asked == 2
    assert scores[0].frequency == 1.0
    assert scores[1].frequency == 0.5
    assert scores[0].likelihood > scores[1].likelihood


def test_recency_decay_halves_and_recent_topic_wins():
    assert exam.recency_decay(2026, 2026) == pytest.approx(1.0)
    assert exam.recency_decay(2023, 2026) == pytest.approx(0.5)
    assert exam.recency_decay(2020, 2026) == pytest.approx(0.25)

    scores = exam.score_topics(
        [
            {"topic": "Scheduling", "year": 2026, "marks": 5},
            {"topic": "File systems", "year": 2020, "marks": 5},
        ],
        2026,
    )
    assert [s.topic for s in scores] == ["Scheduling", "File systems"]
    assert scores[0].recency_weight == 1.0
    assert scores[1].recency_weight == pytest.approx(0.25)


def test_marks_share_uses_real_marks():
    scores = exam.score_topics(
        [
            {"topic": "Scheduling", "year": 2024, "marks": 10},
            {"topic": "Paging", "year": 2024, "marks": 2},
        ],
        2026,
    )
    assert scores[0].topic == "Scheduling"
    assert scores[0].marks_share == pytest.approx(10 / 12)
    assert scores[0].marks == 1.0
    assert scores[1].marks == pytest.approx(0.2)
    assert scores[0].likelihood > scores[1].likelihood


def test_missing_marks_do_not_break_the_score():
    scores = exam.score_topics([{"topic": "Paging", "year": 2024, "marks": None}], 2026)
    assert len(scores) == 1
    assert scores[0].marks_share == 0.0
    assert 0.0 <= scores[0].likelihood <= 100.0


def test_due_gap_rewards_topics_that_have_not_appeared_recently():
    assert exam.years_since_last_asked([2020, 2022], 2026) == 4
    assert exam.years_since_last_asked([], 2026) == 0

    scores = exam.score_topics(
        [
            {"topic": "Old topic", "year": 2020, "marks": 5},
            {"topic": "New topic", "year": 2026, "marks": 5},
        ],
        2026,
    )
    by_topic = {s.topic: s for s in scores}
    assert by_topic["Old topic"].due_gap == 1.0
    assert by_topic["New topic"].due_gap == 0.0
    assert by_topic["Old topic"].years_since_last_asked == 6


def test_ties_are_deterministic_and_alphabetical():
    questions = [
        {"topic": "Zeta", "year": 2024, "marks": 5},
        {"topic": "Alpha", "year": 2024, "marks": 5},
    ]
    first = exam.score_topics(questions, 2026)
    second = exam.score_topics(list(reversed(questions)), 2026)
    assert [s.topic for s in first] == ["Alpha", "Zeta"]
    assert [s.topic for s in second] == ["Alpha", "Zeta"]
    assert first[0].likelihood == first[1].likelihood


def test_likelihood_stays_in_range():
    scores = exam.score_topics(
        [
            {"topic": "A", "year": 2026, "marks": 10},
            {"topic": "A", "year": 2025, "marks": 10},
            {"topic": "B", "year": 2019, "marks": 1},
        ],
        2026,
    )
    assert scores
    assert all(0.0 <= s.likelihood <= 100.0 for s in scores)
    assert scores[0].topic == "A"


def test_blank_topics_are_ignored():
    assert exam.score_topics([{"topic": "", "year": 2024, "marks": 5}], 2026) == []


# ---------------------------------------------------------------------------
# Dedupe and model-output validation
# ---------------------------------------------------------------------------
def test_near_duplicate_questions_are_deduped():
    questions = [
        {"text": "Explain paging and segmentation with diagrams.", "year": 2023},
        {"text": "Explain paging and segmentation with diagrams", "year": 2024},  # same question
        {"text": "Compare FIFO and LRU page replacement.", "year": 2024},
    ]
    kept = exam.dedupe_questions(questions)
    assert len(kept) == 2
    assert kept[0]["year"] == 2023
    assert kept[1]["text"].startswith("Compare FIFO")


def test_question_validation_drops_junk_and_clamps_marks():
    out = exam.normalize_questions(
        {
            "questions": [
                {"text": "Explain virtual memory.", "marks": 999, "qtype": "long answer"},
                {"text": "tiny", "marks": 5},
                "Apply the Banker's algorithm to the table.",
                {"nope": True},
            ]
        },
        2024,
    )
    assert len(out) == 2
    assert out[0]["marks"] == 100.0
    assert out[0]["qtype"] == "long"
    assert out[0]["year"] == 2024
    assert out[1]["qtype"] == "other"


def test_syllabus_validation_requires_units_with_topics():
    units = exam.normalize_syllabus(
        {
            "units": [
                {"unit": "Unit 1: Processes", "topics": ["Process states", "process states", "Scheduling"]},
                {"unit": "", "topics": ["Ignored"]},
                {"unit": "Empty unit", "topics": []},
            ]
        }
    )
    assert units == [{"unit": "Unit 1: Processes", "topics": ["Process states", "Scheduling"]}]
    with pytest.raises(ValueError):
        exam.normalize_syllabus({"units": []})


def test_why_must_cite_a_year_that_exists_in_the_data():
    years = (2022, 2024)
    assert exam.cite_only_years("Asked in 2024 as a 10-mark question.", years).endswith("question.")
    assert exam.cite_only_years("Asked in 2011 repeatedly.", years) == "Asked in 2022, 2024."
    # Mixing one real year with a fabricated one is not good enough.
    assert exam.cite_only_years("Asked in 2022 and 2011.", years) == "Asked in 2022, 2024."
    assert exam.cite_only_years("", years) == "Asked in 2022, 2024."


# ---------------------------------------------------------------------------
# Full pipeline (fake embedder + fake LLM)
# ---------------------------------------------------------------------------
class FakeLLM:
    def __init__(self) -> None:
        self.prediction_payloads: list[list[dict]] = []

    async def complete_json(self, messages, **_kwargs):
        system = messages[0]["content"]
        user = messages[-1]["content"]
        if "list its units" in system:
            return {
                "units": [
                    {"unit": "Unit 1: Processes", "topics": ["Process states", "CPU scheduling"]},
                    {"unit": "Unit 2: Memory", "topics": ["Paging", "Page replacement"]},
                ]
            }
        if "extract exam questions" in system:
            # The same two questions appear in both papers: dedupe must merge their years.
            return {
                "questions": [
                    {"text": "Explain process state transitions.", "marks": 5, "qtype": "short"},
                    {"text": "Explain process state transitions with a diagram.", "marks": 8, "qtype": "long"},
                ]
            }
        if "Assign each exam question" in system:
            return {"assignments": [{"id": 1, "topic": "Unit 1: Processes"}, {"id": 2, "topic": "Unit 1: Processes"}]}
        if "predict likely exam questions" in system:
            self.prediction_payloads.append(db.jload(user, []))
            return {
                "topics": [
                    {
                        "topic": "Process states",
                        "predictions": [
                            {"text": "Draw and explain the process state diagram.", "why": "Asked in 2023 as a 5-mark question."},
                            {"text": "Which events cause a context switch?", "why": "Seen in 2011 only."},
                        ],
                    }
                ]
            }
        raise AssertionError(f"unexpected prompt: {system[:60]}")


def test_run_analysis_produces_a_scored_report(monkeypatch):
    fake = FakeLLM()
    monkeypatch.setattr(llm, "complete_json", fake.complete_json)
    monkeypatch.setattr(exam, "_embedding_similarity", lambda q, t: None)  # force the LLM mapping path

    sources = [
        {"kind": "syllabus", "year": None, "name": "Syllabus", "text": "Processes and memory"},
        {"kind": "paper", "year": 2022, "name": "2022 paper", "text": "paper"},
        {"kind": "paper", "year": 2023, "name": "2023 paper", "text": "paper"},
    ]
    report = exam.create_report("u1", "w1", "Operating Systems")
    asyncio.run(exam.run_analysis(report["id"], "u1", "w1", sources))

    stored = exam.get_report("u1", report["id"])
    assert stored["status"] == "ready"
    assert stored["progress"] == 100
    assert stored["years"] == [2022, 2023]
    assert stored["questionCount"] == 2  # the two duplicate texts collapsed into two entries
    assert stored["topics"] and stored["topics"][0]["topic"] == "Process states"
    top = stored["topics"][0]
    assert 0.0 <= top["likelihood"] <= 100.0
    assert top["timesAsked"] == 4  # each of the 2 unique questions appeared in both years
    assert top["yearsAsked"] == [2022, 2023]
    assert top["yearCounts"] == {"2022": 2, "2023": 2}
    assert len(top["predictions"]) == 2
    # The model's 2023 citation is real and kept; the fabricated 2011 one is replaced.
    assert top["predictions"][0]["why"].startswith("Asked in 2023")
    assert top["predictions"][1]["why"] == "Asked in 2022, 2023."

    rows = db.query("SELECT * FROM exam_questions WHERE report_id=?", (report["id"],))
    assert len(rows) == 2 and rows[0]["topic"] == "Process states"


def test_run_analysis_records_an_error_without_a_syllabus():
    report = exam.create_report("u1", "w1", "No syllabus")
    asyncio.run(exam.run_analysis(report["id"], "u1", "w1", [{"kind": "paper", "year": 2024, "text": "paper"}]))
    stored = exam.get_report("u1", report["id"])
    assert stored["status"] == "error"
    assert "syllabus" in stored["error"].lower()


def test_reports_are_scoped_to_their_owner():
    report = exam.create_report("u1", "w1", "Mine")
    with pytest.raises(Exception):
        exam.get_report("intruder", report["id"])
