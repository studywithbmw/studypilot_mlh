"""Vector store: local Qdrant (in-process, no server) + fastembed (ONNX, no PyTorch).

Embedding a query takes a few milliseconds and a search a few more, because nothing
leaves this machine. Every point carries user_id/workspace_id/doc_id so one user can
never retrieve another user's text.
"""
import logging
import threading
import uuid
from collections.abc import Callable

from .config import settings
from .loaders import Chunk
from .rerank import rerank

log = logging.getLogger("studypilot.store")
COLLECTION = "studypilot_chunks"


class Store:
    def __init__(self) -> None:
        from fastembed import TextEmbedding
        from qdrant_client import QdrantClient
        from qdrant_client.models import Distance, VectorParams

        self._lock = threading.RLock()
        log.info("Loading embedding model %s (first run downloads ~130 MB)...", settings.embedding_model)
        self.embedder = TextEmbedding(
            model_name=settings.embedding_model,
            cache_dir=str(settings.models_dir),
            threads=settings.embed_threads or None,
        )
        dim = len(next(iter(self.embedder.embed(["dimension probe"]))))

        if settings.qdrant_url:
            self.client = QdrantClient(url=settings.qdrant_url, api_key=settings.qdrant_api_key or None)
        else:
            self.client = QdrantClient(path=str(settings.qdrant_path))
        if not self.client.collection_exists(COLLECTION):
            self.client.create_collection(COLLECTION, vectors_config=VectorParams(size=dim, distance=Distance.COSINE))
        else:
            existing = self.client.get_collection(COLLECTION).config.params.vectors.size
            if existing != dim:
                raise RuntimeError(
                    f"The stored vectors have {existing} dimensions but {settings.embedding_model} produces {dim}. "
                    f"Delete the folder {settings.qdrant_path} (and re-upload documents) after changing EMBEDDING_MODEL."
                )
        log.info("Vector store ready (dim=%d)", dim)

    # -- writing ----------------------------------------------------------
    def add_chunks(
        self,
        *,
        user_id: str,
        workspace_id: str,
        doc_id: str,
        doc_name: str,
        chunks: list[Chunk],
        on_progress: Callable[[int, int], None] | None = None,
    ) -> None:
        from qdrant_client.models import PointStruct

        step = max(1, settings.embed_batch)
        try:
            for i in range(0, len(chunks), step):
                batch = chunks[i : i + step]
                vectors = list(self.embedder.passage_embed([c.text for c in batch], batch_size=step))
                points = [
                    PointStruct(
                        id=str(uuid.uuid4()),
                        vector=vec.tolist(),
                        payload={
                            "user_id": user_id,
                            "workspace_id": workspace_id,
                            "doc_id": doc_id,
                            "doc_name": doc_name,
                            "page": c.page,
                            "label": c.label,
                            "chunk": c.index,
                            "text": c.text,
                        },
                    )
                    for c, vec in zip(batch, vectors)
                ]
                with self._lock:
                    self.client.upsert(COLLECTION, points=points)
                if on_progress:
                    on_progress(min(i + step, len(chunks)), len(chunks))
        except Exception:
            self.delete_document(doc_id)  # never leave half a document behind
            raise

    def delete_document(self, doc_id: str) -> None:
        from qdrant_client.models import FieldCondition, Filter, FilterSelector, MatchValue

        with self._lock:
            self.client.delete(
                COLLECTION,
                points_selector=FilterSelector(
                    filter=Filter(must=[FieldCondition(key="doc_id", match=MatchValue(value=doc_id))])
                ),
            )

    # -- reading ----------------------------------------------------------
    def _filter(self, user_id: str, workspace_id: str | None, doc_ids: list[str] | None):
        from qdrant_client.models import FieldCondition, Filter, MatchAny, MatchValue

        must = [FieldCondition(key="user_id", match=MatchValue(value=user_id))]
        if workspace_id:
            must.append(FieldCondition(key="workspace_id", match=MatchValue(value=workspace_id)))
        if doc_ids:
            must.append(FieldCondition(key="doc_id", match=MatchAny(any=doc_ids)))
        return Filter(must=must)

    def search(
        self, query: str, k: int, *, user_id: str, workspace_id: str | None = None, doc_ids: list[str] | None = None
    ) -> list[dict]:
        vector = next(iter(self.embedder.query_embed(query))).tolist()
        with self._lock:
            result = self.client.query_points(
                COLLECTION,
                query=vector,
                limit=max(k * 4, 20),
                query_filter=self._filter(user_id, workspace_id, doc_ids),
                with_payload=True,
            )
        hits = [{**(p.payload or {}), "chunk_id": str(p.id), "vector_score": float(p.score)} for p in result.points]
        return rerank(query, hits, k)

    def get_chunks(self, doc_id: str, user_id: str) -> list[dict]:
        """All chunks of one document in reading order (summaries, quizzes, flashcards)."""
        out: list[dict] = []
        offset = None
        flt = self._filter(user_id, None, [doc_id])
        with self._lock:
            while True:
                points, offset = self.client.scroll(
                    COLLECTION, scroll_filter=flt, limit=256, offset=offset, with_payload=True
                )
                out.extend(p.payload or {} for p in points)
                if offset is None:
                    break
        return sorted(out, key=lambda c: c.get("chunk", 0))


_store: Store | None = None
_store_lock = threading.Lock()


def get_store() -> Store:
    global _store
    with _store_lock:
        if _store is None:
            _store = Store()
        return _store
