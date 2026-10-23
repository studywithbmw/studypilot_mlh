"""API schemas. JSON keys are camelCase to match src/types/index.ts."""

import re
from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from pydantic.alias_generators import to_camel

SupportedLanguage = Literal["en", "ta", "hi"]
AIModelId = Literal["auto", "groq-llama", "gemini-long"]
ExplanationLevel = Literal["eli5", "student", "expert"]

_HEX_COLOR = re.compile(r"#[0-9A-Fa-f]{6}")


class CamelModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
    )


class UserProfileOut(CamelModel):
    """src/types UserProfile, plus onboarding fields."""

    id: UUID
    email: str | None = None
    name: str
    avatar_url: str | None = None
    role: str
    goal: str
    subjects: list[str]
    onboarded: bool
    streak_days: int
    preferred_language: SupportedLanguage
    default_model: AIModelId
    default_explanation_level: ExplanationLevel
    hybrid_search_enabled: bool
    reranker_enabled: bool
    top_k: int
    memory_enabled: bool


class ProfilePatch(CamelModel):
    """Partial update; unknown fields are rejected, nulls only where nullable."""

    model_config = ConfigDict(
        alias_generator=to_camel, populate_by_name=True, extra="forbid"
    )

    name: str | None = Field(default=None, min_length=1, max_length=100)
    avatar_url: str | None = Field(default=None, max_length=2048)
    role: str | None = Field(default=None, min_length=1, max_length=40)
    goal: str | None = Field(default=None, max_length=500)
    subjects: list[str] | None = Field(default=None, max_length=20)
    onboarded: bool | None = None
    preferred_language: SupportedLanguage | None = None
    default_model: AIModelId | None = None
    default_explanation_level: ExplanationLevel | None = None
    hybrid_search_enabled: bool | None = None
    reranker_enabled: bool | None = None
    top_k: int | None = Field(default=None, ge=1, le=50)
    memory_enabled: bool | None = None

    @field_validator("name")
    @classmethod
    def _name_not_blank(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError("name cannot be blank")
        return value

    @field_validator("goal")
    @classmethod
    def _strip_goal(cls, value: str | None) -> str | None:
        return value.strip() if isinstance(value, str) else value

    @field_validator("subjects")
    @classmethod
    def _clean_subjects(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return None
        cleaned = [s.strip() for s in value if s and s.strip()]
        if any(len(s) > 60 for s in cleaned):
            raise ValueError("each subject must be at most 60 characters")
        return cleaned

    @model_validator(mode="after")
    def _no_null_for_required_columns(self) -> "ProfilePatch":
        for field in self.model_fields_set:
            if field != "avatar_url" and getattr(self, field) is None:
                raise ValueError(f"{to_camel(field)} cannot be null")
        return self


class DeleteAccountIn(CamelModel):
    model_config = ConfigDict(extra="forbid")

    confirm: Literal["DELETE"]


# ---------------------------------------------------------------------------
# AI (Stage 3)
# ---------------------------------------------------------------------------

class AIProviderStatusOut(CamelModel):
    """One provider's real health. No fabricated metrics: ``status`` is
    ``not_configured`` when the key is missing."""

    provider: str
    configured: bool
    status: Literal["ok", "degraded", "error", "not_configured"]
    model: str | None = None
    breakerState: Literal["closed", "open", "half_open"] = "closed"
    lastSuccessAt: datetime | None = None
    lastFailureAt: datetime | None = None
    lastErrorCode: str | None = None


class AIQuotaOut(CamelModel):
    day: date
    used: int
    limit: int
    remaining: int


class AIStatusOut(CamelModel):
    providers: list[AIProviderStatusOut]
    quota: AIQuotaOut


class QuickAskIn(CamelModel):
    model_config = ConfigDict(
        alias_generator=to_camel, populate_by_name=True, extra="forbid"
    )

    text: str = Field(min_length=1, max_length=2000)
    explanation_level: ExplanationLevel | None = None
    language: SupportedLanguage | None = None

    @field_validator("text")
    @classmethod
    def _strip_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("text cannot be blank")
        return value


class TokenUsageOut(CamelModel):
    promptTokens: int
    completionTokens: int
    totalTokens: int


class QuickAskDoneOut(CamelModel):
    provider: str
    model: str
    latencyMs: int
    usage: TokenUsageOut


# ---------------------------------------------------------------------------
# Documents (Stage 4)
# ---------------------------------------------------------------------------

DocumentTypeLiteral = Literal["pdf", "docx", "pptx", "txt", "md", "web", "youtube"]
PipelineStatusLiteral = Literal[
    "queued", "parsing", "chunking", "embedding", "ready", "error"
]
LinkType = Literal["web", "youtube"]


class DocumentOut(CamelModel):
    """src/types DocumentItem."""

    id: UUID
    workspace_id: UUID
    name: str
    type: DocumentTypeLiteral
    size_bytes: int
    page_count: int | None = None
    duration_seconds: int | None = None
    source_url: str | None = None
    status: PipelineStatusLiteral
    progress_percent: int
    error: str | None = None
    chunk_count: int = 0
    created_at: datetime


class DocumentLinkIn(CamelModel):
    model_config = ConfigDict(
        alias_generator=to_camel, populate_by_name=True, extra="forbid"
    )

    url: str = Field(min_length=1, max_length=2048)
    type: LinkType

    @field_validator("url")
    @classmethod
    def _strip_url(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("url cannot be blank")
        return value


class WorkspaceOut(CamelModel):
    id: UUID
    name: str
    description: str | None = None
    color: str
    emoji: str
    document_count: int = 0
    deck_count: int = 0
    quiz_count: int = 0
    is_archived: bool = False
    created_at: datetime


class WorkspaceCreate(CamelModel):
    model_config = ConfigDict(
        alias_generator=to_camel, populate_by_name=True, extra="forbid"
    )

    name: str = Field(min_length=1, max_length=80)
    description: str | None = Field(default=None, max_length=500)
    color: str = "#10B981"
    emoji: str = Field(default="📚", min_length=1, max_length=16)

    @field_validator("name")
    @classmethod
    def _strip_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("name cannot be blank")
        return value

    @field_validator("color")
    @classmethod
    def _color(cls, value: str) -> str:
        if not _HEX_COLOR.fullmatch(value):
            raise ValueError("color must look like #10B981")
        return value


class WorkspacePatch(CamelModel):
    model_config = ConfigDict(
        alias_generator=to_camel, populate_by_name=True, extra="forbid"
    )

    name: str | None = Field(default=None, min_length=1, max_length=80)
    description: str | None = Field(default=None, max_length=500)
    color: str | None = None
    emoji: str | None = Field(default=None, min_length=1, max_length=16)
    is_archived: bool | None = None

    @field_validator("name")
    @classmethod
    def _strip_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError("name cannot be blank")
        return value

    @field_validator("color")
    @classmethod
    def _color(cls, value: str | None) -> str | None:
        if value is not None and not _HEX_COLOR.fullmatch(value):
            raise ValueError("color must look like #10B981")
        return value

    @model_validator(mode="after")
    def _no_null_for_required_columns(self) -> "WorkspacePatch":
        for field in self.model_fields_set:
            if field != "description" and getattr(self, field) is None:
                raise ValueError(f"{to_camel(field)} cannot be null")
        return self


# ---------------------------------------------------------------------------
# Chat / retrieval / memory (Stage 5)
# ---------------------------------------------------------------------------


class CriticVerdictOut(CamelModel):
    passed: bool
    hallucination_detected: bool
    unsupported_sentence: str | None = None
    note: str = ""


class AgentStepOut(CamelModel):
    """src/types AgentReasoningStep."""

    agent: Literal["Planner", "Retriever", "Answerer", "Critic"]
    duration_ms: int = 0
    status: Literal["completed", "flagged"] = "completed"
    output_snippet: str = ""
    sub_queries: list[str] | None = None
    critic_verdict: CriticVerdictOut | None = None
    #: 0..100 grounding confidence computed server-side (critic events only)
    confidence: int | None = None
    tier: Literal["high", "medium", "low"] | None = None


class RetrievalItemOut(CamelModel):
    """src/types RetrievalInspectionItem."""

    chunk_id: UUID
    doc_name: str
    page_or_time: str = ""
    snippet: str
    bm25_score: float | None = None
    vector_score: float | None = None
    fused_rank: int = 0
    reranker_score: float | None = None
    initial_rank: int = 0
    final_rank: int = 0


class CitationOut(CamelModel):
    """src/types Citation — built from chunk metadata, never model text."""

    id: str
    document_id: UUID
    document_name: str
    page_number: int | None = None
    timestamp: str | None = None
    snippet: str
    confidence: float


class ChatMessageOut(CamelModel):
    """src/types ChatMessage."""

    id: UUID
    conversation_id: UUID
    role: Literal["user", "assistant", "system"]
    content: str
    created_at: datetime
    citations: list[CitationOut] = Field(default_factory=list)
    confidence_score: float | None = None
    confidence_tier: Literal["high", "medium", "low"] | None = None
    is_not_found: bool = False
    is_general_knowledge: bool = False
    used_memory: bool = False
    resolved_query: str | None = None
    explanation_level: str | None = None
    reasoning_trace: list[AgentStepOut] = Field(default_factory=list)
    retrieval_inspection: list[RetrievalItemOut] = Field(default_factory=list)


class ConversationOut(CamelModel):
    """src/types Conversation."""

    id: UUID
    workspace_id: UUID
    title: str
    #: '"all"' | '"selected"' | [document ids] — mirrors the JSONB column
    document_scope: str | list[str] = "all"
    explanation_level: ExplanationLevel = "student"
    answer_language: SupportedLanguage = "en"
    model: AIModelId = "auto"
    is_pinned: bool = False
    created_at: datetime
    updated_at: datetime
    messages: list[ChatMessageOut] = Field(default_factory=list)


class ConversationCreate(CamelModel):
    model_config = ConfigDict(
        alias_generator=to_camel, populate_by_name=True, extra="forbid"
    )

    title: str = Field(default="New Chat", min_length=1, max_length=120)
    explanation_level: ExplanationLevel | None = None
    answer_language: SupportedLanguage | None = None
    model: AIModelId | None = None
    document_scope: str | list[UUID] | None = None


class ConversationPatch(CamelModel):
    model_config = ConfigDict(
        alias_generator=to_camel, populate_by_name=True, extra="forbid"
    )

    title: str | None = Field(default=None, min_length=1, max_length=120)
    explanation_level: ExplanationLevel | None = None
    answer_language: SupportedLanguage | None = None
    model: AIModelId | None = None
    document_scope: str | list[UUID] | None = None
    is_pinned: bool | None = None


class ChatStreamIn(CamelModel):
    """Body of POST /chat/stream (SSE follows)."""

    model_config = ConfigDict(
        alias_generator=to_camel, populate_by_name=True, extra="forbid"
    )

    conversation_id: UUID
    query: str = Field(min_length=1, max_length=2000)
    explanation_level: ExplanationLevel | None = None
    answer_language: SupportedLanguage | None = None
    model: AIModelId | None = None
    #: opt-in: answer from general knowledge when retrieval finds nothing
    general_knowledge: bool = False

    @field_validator("query")
    @classmethod
    def _strip_query(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("query cannot be blank")
        return value


class MemoryFactOut(CamelModel):
    """src/types MemoryFact."""

    id: UUID
    workspace_id: UUID
    fact: str
    is_pinned: bool = False
    created_at: datetime


class MemoryFactCreate(CamelModel):
    model_config = ConfigDict(
        alias_generator=to_camel, populate_by_name=True, extra="forbid"
    )

    fact: str = Field(min_length=1, max_length=500)

    @field_validator("fact")
    @classmethod
    def _strip_fact(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("fact cannot be blank")
        return value


# ---------------------------------------------------------------------------
# Exam Predictor
# ---------------------------------------------------------------------------
ExamDocKind = Literal["paper", "syllabus"]
ExamReportStatus = Literal["queued", "running", "ready", "error"]


class ExamDocumentIn(CamelModel):
    """One uploaded document tagged as a previous-year paper or the syllabus."""

    model_config = ConfigDict(
        alias_generator=to_camel, populate_by_name=True, extra="forbid"
    )

    document_id: str = Field(min_length=1, max_length=64)
    kind: ExamDocKind
    year: int | None = Field(default=None, ge=1900, le=2100)

    @model_validator(mode="after")
    def _paper_needs_a_year(self) -> "ExamDocumentIn":
        if self.kind == "paper" and self.year is None:
            raise ValueError("paper documents need a year")
        return self


class ExamAnalyzeIn(CamelModel):
    model_config = ConfigDict(
        alias_generator=to_camel, populate_by_name=True, extra="forbid"
    )

    documents: list[ExamDocumentIn] = Field(min_length=1, max_length=30)
    title: str = Field(default="", max_length=160)
    model: AIModelId = "auto"

    @field_validator("title")
    @classmethod
    def _strip_title(cls, value: str) -> str:
        return value.strip()


class ExamQuestionOut(CamelModel):
    """A real past question; ``years`` lists every year its duplicate appeared."""

    text: str
    year: int | None = None
    years: list[int] = Field(default_factory=list)
    marks: float | None = None
    qtype: str = "other"
    unit: str | None = None


class ExamPredictionOut(CamelModel):
    """A likely future question plus a one-line, year-grounded reason."""

    text: str
    why: str


class ExamTopicOut(CamelModel):
    """One topic's deterministic statistics and (top topics only) predictions."""

    topic: str
    unit: str = ""
    likelihood: float
    times_asked: int
    years_asked: list[int] = Field(default_factory=list)
    marks_share: float
    recency_weight: float
    years_since_last_asked: int
    year_counts: dict[str, int] = Field(default_factory=dict)
    questions: list[ExamQuestionOut] = Field(default_factory=list)
    predictions: list[ExamPredictionOut] = Field(default_factory=list)


class ExamDocumentOut(CamelModel):
    document_id: str | None = None
    name: str
    kind: ExamDocKind
    year: int | None = None


class ExamReportOut(CamelModel):
    """src/types ExamReport — `progress` is 0..100 while `status` is running."""

    id: str
    workspace_id: str
    title: str
    status: ExamReportStatus
    progress: int
    created_at: str
    years: list[int] = Field(default_factory=list)
    question_count: int = 0
    documents: list[ExamDocumentOut] = Field(default_factory=list)
    topics: list[ExamTopicOut] = Field(default_factory=list)
    weights: dict[str, float] = Field(default_factory=dict)
    disclaimer: str = ""
    computed_at: str | None = None
    error: str | None = None


class ExamReportSummaryOut(CamelModel):
    """The history list: enough to pick a report, not the whole result."""

    id: str
    workspace_id: str
    title: str
    status: ExamReportStatus
    progress: int
    question_count: int = 0
    years: list[int] = Field(default_factory=list)
    top_topics: list[str] = Field(default_factory=list)
    created_at: str


# ---------------------------------------------------------------------------
# Study Rooms
# ---------------------------------------------------------------------------
RoomRole = Literal["host", "member"]


class RoomCreateIn(CamelModel):
    model_config = ConfigDict(
        alias_generator=to_camel, populate_by_name=True, extra="forbid"
    )

    name: str = Field(min_length=1, max_length=80)
    max_members: int = Field(default=8, ge=2, le=20)

    @field_validator("name")
    @classmethod
    def _strip_room_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("name cannot be blank")
        return value


class RoomJoinIn(CamelModel):
    model_config = ConfigDict(
        alias_generator=to_camel, populate_by_name=True, extra="forbid"
    )

    code: str = Field(min_length=4, max_length=12)

    @field_validator("code")
    @classmethod
    def _normalise_code(cls, value: str) -> str:
        value = value.strip().upper()
        if not value:
            raise ValueError("code cannot be blank")
        return value


class RoomLockIn(CamelModel):
    model_config = ConfigDict(
        alias_generator=to_camel, populate_by_name=True, extra="forbid"
    )

    locked: bool = True


class RoomKickIn(CamelModel):
    model_config = ConfigDict(
        alias_generator=to_camel, populate_by_name=True, extra="forbid"
    )

    user_id: str = Field(min_length=1, max_length=64)


class RoomMemberOut(CamelModel):
    user_id: str
    display_name: str
    role: RoomRole
    joined_at: str
    online: bool = False


class RoomMessageOut(CamelModel):
    id: str
    user_id: str
    display_name: str
    text: str
    is_ai: bool = False
    created_at: str


class RoomTimerOut(CamelModel):
    started_at: str
    duration_s: int
    label: str = ""
    remaining_s: int


class RoomCreditOut(CamelModel):
    started_at: str
    minutes: int
    label: str = ""


class RoomDocumentOut(CamelModel):
    doc_id: str
    name: str


class RoomLeaderboardOut(CamelModel):
    user_id: str
    display_name: str
    minutes: int = 0
    points: int = 0


class RoomOut(CamelModel):
    """Everything the room page needs for one snapshot."""

    id: str
    code: str
    name: str
    host_id: str
    host_name: str
    max_members: int
    is_locked: bool
    is_host: bool
    member_count: int
    online_count: int
    created_at: str
    ended_at: str | None = None
    members: list[RoomMemberOut] = Field(default_factory=list)
    messages: list[RoomMessageOut] = Field(default_factory=list)
    timer: RoomTimerOut | None = None
    recent_credits: list[RoomCreditOut] = Field(default_factory=list)
    documents: list[RoomDocumentOut] = Field(default_factory=list)
    leaderboard: list[RoomLeaderboardOut] = Field(default_factory=list)


class RoomSummaryOut(CamelModel):
    id: str
    code: str
    name: str
    host_id: str
    max_members: int
    is_locked: bool
    is_host: bool
    member_count: int
    online_count: int
    created_at: str
