"""Exam Predictor endpoints: analyze tagged papers, poll a report, list history, demo seed."""
from fastapi import APIRouter, BackgroundTasks, Depends

from . import db, exam
from .exam_demo import demo_sources
from .auth import AuthUser, current_user
from .errors import AppError
from .routes_core import count_ai_call, has_workspace, owned_workspace
from .schemas import ExamAnalyzeIn, ExamReportOut, ExamReportSummaryOut

router = APIRouter()


def _validate_documents(user_id: str, workspace_id: str, body: ExamAnalyzeIn) -> None:
    if not any(d.kind == "syllabus" for d in body.documents):
        raise AppError("Tag one document as the syllabus.", code="validation_error", status_code=422)
    if not any(d.kind == "paper" for d in body.documents):
        raise AppError("Tag at least one previous-year paper.", code="validation_error", status_code=422)
    seen: set[str] = set()
    for item in body.documents:
        if item.document_id in seen:
            raise AppError("Each document can only be tagged once.", code="validation_error", status_code=422)
        seen.add(item.document_id)
        row = db.one(
            "SELECT name, type, status FROM documents WHERE id=? AND user_id=? AND workspace_id=?",
            (item.document_id, user_id, workspace_id),
        )
        if not row:
            raise AppError("That document is not in this workspace.", code="not_found", status_code=404)
        if row["type"] in ("web", "youtube"):
            raise AppError(
                f"{row['name']} is a link. Exam Predictor needs uploaded files.",
                code="unsupported_type",
                status_code=422,
            )
        if row["status"] != "ready":
            raise AppError(
                f"{row['name']} is still processing. Wait for it to finish, then analyze.",
                code="document_not_ready",
                status_code=409,
            )


@router.post("/workspaces/{workspace_id}/exam/analyze", response_model=ExamReportOut, status_code=202)
async def analyze(
    workspace_id: str,
    body: ExamAnalyzeIn,
    background: BackgroundTasks,
    user: AuthUser = Depends(current_user),
):
    owned_workspace(user.user_id, workspace_id)
    _validate_documents(user.user_id, workspace_id, body)
    count_ai_call(user.user_id)  # the whole analysis counts as one AI request
    report = exam.create_report(user.user_id, workspace_id, body.title or "Exam prediction")
    background.add_task(
        exam.run_analysis,
        report["id"],
        user.user_id,
        workspace_id,
        [item.model_dump() for item in body.documents],
        body.model,
    )
    return report


@router.post("/workspaces/{workspace_id}/exam/demo", response_model=ExamReportOut, status_code=202)
async def demo(
    workspace_id: str,
    background: BackgroundTasks,
    user: AuthUser = Depends(current_user),
):
    """Seed a demo report from three built-in papers + a syllabus (no uploads needed)."""
    owned_workspace(user.user_id, workspace_id)
    count_ai_call(user.user_id)
    report = exam.create_report(user.user_id, workspace_id, "Demo — Operating Systems past papers")
    background.add_task(exam.run_analysis, report["id"], user.user_id, workspace_id, demo_sources())
    return report


@router.get("/exam/reports/{report_id}", response_model=ExamReportOut)
def get_report(report_id: str, user: AuthUser = Depends(current_user)):
    return exam.get_report(user.user_id, report_id)


@router.get("/workspaces/{workspace_id}/exam/reports", response_model=list[ExamReportSummaryOut])
def list_reports(workspace_id: str, user: AuthUser = Depends(current_user)):
    if not has_workspace(user.user_id, workspace_id):
        return []
    return exam.list_reports(user.user_id, workspace_id)
