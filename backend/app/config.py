"""Central settings, read once from environment variables / backend/.env."""
import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")


def _list(value: str) -> list[str]:
    return [v.strip() for v in (value or "").split(",") if v.strip()]


def _int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)).strip())
    except ValueError:
        return default


def _float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, str(default)).strip())
    except ValueError:
        return default


_DEV_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:5173", "http://127.0.0.1:5173"]


def _cors() -> list[str]:
    """Origins from CORS_ORIGINS plus the local dev servers (an old .env that only lists
    :5173 must not silently block the app on :3000)."""
    out = _list(os.getenv("CORS_ORIGINS", ""))
    return out + [o for o in _DEV_ORIGINS if o not in out]


@dataclass
class Settings:
    # --- LLMs (Groq first, Gemini as automatic fallback) ---
    llm_providers: list[str] = field(default_factory=lambda: _list(os.getenv("LLM_PROVIDERS", "groq,gemini")))
    groq_api_key: str = os.getenv("GROQ_API_KEY", "").strip()
    groq_model: str = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b").strip()
    groq_extra_models: list[str] = field(default_factory=lambda: _list(os.getenv("GROQ_EXTRA_MODELS", "")))
    gemini_api_key: str = (os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY", "")).strip()
    gemini_model: str = os.getenv("GEMINI_MODEL", "gemini-3.8-flash").strip()
    gemini_extra_models: list[str] = field(default_factory=lambda: _list(os.getenv("GEMINI_EXTRA_MODELS", "")))
    llm_timeout: int = _int("LLM_TIMEOUT_SECONDS", 45)

    # --- Retrieval ---
    embedding_model: str = os.getenv("EMBEDDING_MODEL", "BAAI/bge-small-en-v1.5").strip()
    chunk_size: int = _int("CHUNK_SIZE", 900)
    chunk_overlap: int = _int("CHUNK_OVERLAP", 150)
    top_k: int = _int("TOP_K", 5)
    min_score: float = _float("ANSWER_MIN_SCORE", 0.40)
    embed_batch: int = _int("EMBED_BATCH", 32)
    embed_threads: int = _int("EMBED_THREADS", 0)  # 0 = let ONNX decide
    max_summary_chars: int = _int("MAX_SUMMARY_CHARS", 12000)

    # --- Storage (everything lives in ./data; only login uses Supabase) ---
    data_dir: Path = Path(os.getenv("DATA_DIR", str(BASE_DIR / "data"))).resolve()
    qdrant_url: str = os.getenv("QDRANT_URL", "").strip()
    qdrant_api_key: str = os.getenv("QDRANT_API_KEY", "").strip()

    # --- Access ---
    supabase_url: str = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
    supabase_jwt_secret: str = os.getenv("SUPABASE_JWT_SECRET", "").strip()
    supabase_service_role_key: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    max_upload_mb: int = _int("MAX_UPLOAD_MB", 25)
    max_documents_per_user: int = _int("MAX_DOCUMENTS_PER_USER", 100)
    daily_ai_requests_per_user: int = _int("DAILY_AI_REQUESTS_PER_USER", 500)
    cors_origins: list[str] = field(default_factory=lambda: _cors())

    @property
    def upload_dir(self) -> Path:
        return self.data_dir / "uploads"

    @property
    def qdrant_path(self) -> Path:
        return self.data_dir / "qdrant"

    @property
    def models_dir(self) -> Path:
        return self.data_dir / "models"

    @property
    def db_path(self) -> Path:
        return self.data_dir / "studypilot.db"


settings = Settings()
for _p in (settings.data_dir, settings.upload_dir, settings.models_dir):
    _p.mkdir(parents=True, exist_ok=True)
