"""LLM access: Groq first, Gemini as automatic fallback.

Plain httpx against the providers' REST APIs (no heavyweight SDKs): one shared
connection pool keeps TLS warm between requests, which is a large part of the
time-to-first-token. If a provider fails before producing any text, the next
candidate answers instead, so a chat never dies on one outage.
"""
import asyncio
import json
import logging
import re
import time
from collections.abc import AsyncIterator
from typing import Any

import httpx

from .config import settings

log = logging.getLogger("studypilot.llm")

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta"

Message = dict[str, str]  # {"role": "system"|"user"|"assistant", "content": "..."}

_client: httpx.AsyncClient | None = None
_health: dict[str, dict[str, Any]] = {}


class ProviderHTTPError(RuntimeError):
    def __init__(self, provider: str, status: int, retry_after: float | None = None) -> None:
        super().__init__(f"{provider} returned HTTP {status}")
        self.provider, self.status, self.retry_after = provider, status, retry_after


class LLMUnavailable(RuntimeError):
    """No provider could answer. The message is safe to show to the user."""


def get_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(
            timeout=httpx.Timeout(connect=8.0, read=float(settings.llm_timeout), write=10.0, pool=5.0),
            limits=httpx.Limits(max_keepalive_connections=8, keepalive_expiry=60),
        )
    return _client


async def close_client() -> None:
    global _client
    if _client is not None and not _client.is_closed:
        await _client.aclose()
    _client = None


def candidates() -> list[tuple[str, str]]:
    """Ordered (provider, model) pairs that have an API key configured."""
    out: list[tuple[str, str]] = []
    for provider in settings.llm_providers:
        p = provider.lower()
        if p == "groq" and settings.groq_api_key:
            out += [("groq", m) for m in [settings.groq_model, *settings.groq_extra_models] if m]
        elif p in ("gemini", "google") and settings.gemini_api_key:
            out += [("gemini", m) for m in [settings.gemini_model, *settings.gemini_extra_models] if m]
    seen: set[tuple[str, str]] = set()
    unique = []
    for c in out:
        if c not in seen:
            seen.add(c)
            unique.append(c)
    return unique


def ordered_candidates(alias: str = "auto") -> list[tuple[str, str]]:
    """Honour the model picker: groq-llama -> Groq first, gemini-long -> Gemini first."""
    cands = candidates()
    prefer = {"groq-llama": "groq", "gemini-long": "gemini"}.get(alias)
    if prefer:
        cands = [c for c in cands if c[0] == prefer] + [c for c in cands if c[0] != prefer]
    return cands


def _mark(provider: str, ok: bool, code: str | None = None) -> None:
    h = _health.setdefault(provider, {})
    h["last_success_at" if ok else "last_failure_at"] = time.time()
    if not ok:
        h["last_error_code"] = code


def provider_status() -> list[dict]:
    """Real health only: a provider without a key reports not_configured."""
    rows = []
    for name, key, model in (
        ("groq", settings.groq_api_key, settings.groq_model),
        ("gemini", settings.gemini_api_key, settings.gemini_model),
    ):
        h = _health.get(name, {})
        ok_at, bad_at = h.get("last_success_at"), h.get("last_failure_at")
        if not key:
            status = "not_configured"
        elif bad_at and (not ok_at or bad_at > ok_at):
            status = "degraded"
        else:
            status = "ok"
        iso = lambda t: time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(t)) if t else None  # noqa: E731
        rows.append(
            {
                "provider": name,
                "configured": bool(key),
                "status": status,
                "model": model if key else None,
                "breakerState": "closed",
                "lastSuccessAt": iso(ok_at),
                "lastFailureAt": iso(bad_at),
                "lastErrorCode": h.get("last_error_code"),
            }
        )
    return rows


def _http_error(provider: str, status: int, body: str, retry_after: str | None = None) -> RuntimeError:
    code = {401: "auth", 403: "auth", 429: "rate_limited"}.get(status, "server" if status >= 500 else "bad_request")
    _mark(provider, False, code)
    log.warning("%s HTTP %s: %s", provider, status, " ".join(body.split())[:200])
    try:
        wait = float(retry_after) if retry_after else None
    except ValueError:
        wait = None
    return ProviderHTTPError(provider, status, wait)


# ---------------------------------------------------------------------------
# Providers
# ---------------------------------------------------------------------------
async def _stream_groq(model: str, messages: list[Message], temperature: float, max_tokens: int | None) -> AsyncIterator[str]:
    body: dict[str, Any] = {"model": model, "messages": messages, "temperature": temperature, "stream": True}
    if max_tokens:
        body["max_tokens"] = max_tokens
    extras = {}
    if "gpt-oss" in model:
        # Reasoning models "think" before answering; low effort cuts the wait a lot.
        extras = {"reasoning_effort": "low", "include_reasoning": False}
    headers = {"Authorization": f"Bearer {settings.groq_api_key}", "Content-Type": "application/json"}
    client = get_client()

    for attempt in (1, 2):
        payload = {**body, **(extras if attempt == 1 else {})}
        async with client.stream("POST", GROQ_URL, headers=headers, json=payload) as resp:
            if resp.status_code >= 400:
                raw = (await resp.aread()).decode("utf-8", "ignore")
                if resp.status_code == 400 and extras and attempt == 1:
                    log.info("Groq rejected reasoning options for %s, retrying without them", model)
                    continue
                raise _http_error("groq", resp.status_code, raw, resp.headers.get("retry-after"))
            async for line in resp.aiter_lines():
                if not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if not data or data == "[DONE]":
                    continue
                try:
                    chunk = json.loads(data)
                except ValueError:
                    continue
                delta = (chunk.get("choices") or [{}])[0].get("delta") or {}
                text = delta.get("content")
                if text:
                    yield text
            return


async def _stream_gemini(
    model: str, messages: list[Message], temperature: float, max_tokens: int | None, json_mode: bool
) -> AsyncIterator[str]:
    system = "\n\n".join(m["content"] for m in messages if m["role"] == "system")
    contents = [
        {"role": "model" if m["role"] == "assistant" else "user", "parts": [{"text": m["content"]}]}
        for m in messages
        if m["role"] != "system"
    ]
    gen: dict[str, Any] = {"temperature": temperature}
    if max_tokens:
        gen["maxOutputTokens"] = max_tokens
    if json_mode:
        gen["responseMimeType"] = "application/json"
    body: dict[str, Any] = {"contents": contents, "generationConfig": gen}
    if system:
        body["systemInstruction"] = {"parts": [{"text": system}]}
    url = f"{GEMINI_BASE}/models/{model}:streamGenerateContent?alt=sse"
    headers = {"x-goog-api-key": settings.gemini_api_key, "Content-Type": "application/json"}

    async with get_client().stream("POST", url, headers=headers, json=body) as resp:
        if resp.status_code >= 400:
            raise _http_error("gemini", resp.status_code, (await resp.aread()).decode("utf-8", "ignore"))
        async for line in resp.aiter_lines():
            if not line.startswith("data:"):
                continue
            data = line[5:].strip()
            if not data:
                continue
            try:
                chunk = json.loads(data)
            except ValueError:
                continue
            for cand in chunk.get("candidates") or []:
                for part in (cand.get("content") or {}).get("parts") or []:
                    if part.get("thought"):
                        continue
                    if part.get("text"):
                        yield part["text"]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
async def stream_text(
    messages: list[Message],
    *,
    alias: str = "auto",
    temperature: float = 0.2,
    max_tokens: int | None = None,
    json_mode: bool = False,
) -> AsyncIterator[str]:
    cands = ordered_candidates(alias)
    if not cands:
        raise LLMUnavailable("No AI key is configured. Add GROQ_API_KEY and/or GEMINI_API_KEY to backend/.env.")

    last: Exception | None = None
    for provider, model in cands:
        for attempt in (1, 2):
            started = False
            try:
                gen = (
                    _stream_groq(model, messages, temperature, max_tokens)
                    if provider == "groq"
                    else _stream_gemini(model, messages, temperature, max_tokens, json_mode)
                )
                async for text in gen:
                    started = True
                    yield text
                if started:
                    _mark(provider, True)
                    return
                log.warning("%s/%s returned an empty answer, trying next model", provider, model)
                break
            except httpx.HTTPError as exc:
                last = exc
                _mark(provider, False, "timeout" if isinstance(exc, httpx.TimeoutException) else "network")
                log.warning("%s/%s transport error: %s", provider, model, type(exc).__name__)
                if started:
                    raise LLMUnavailable("The AI connection dropped mid-answer. Please try again.") from None
                break
            except ProviderHTTPError as exc:
                last = exc
                if started:
                    raise LLMUnavailable("The AI stopped mid-answer. Please try again.") from None
                # Rate limits and "high demand" spikes are short-lived: wait briefly and retry once
                # on the same model before giving up on it.
                if attempt == 1 and exc.status in (429, 503):
                    await asyncio.sleep(min(exc.retry_after or 1.5, 4.0))
                    continue
                break
            except RuntimeError as exc:
                last = exc
                if started:
                    raise LLMUnavailable("The AI stopped mid-answer. Please try again.") from None
                break
    raise LLMUnavailable(_friendly(last))


def _friendly(exc: Exception | None) -> str:
    text = str(exc or "")
    if "HTTP 429" in text or "HTTP 503" in text:
        return "The AI providers are busy or rate-limited right now. Wait about 20 seconds and try again."
    if "HTTP 401" in text or "HTTP 403" in text:
        return "The AI provider rejected the API key. Check GROQ_API_KEY / GEMINI_API_KEY in backend/.env."
    return "The AI service is not responding right now. Please try again."


async def complete_text(messages: list[Message], **kwargs: Any) -> str:
    return "".join([t async for t in stream_text(messages, **kwargs)]).strip()


_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$", re.IGNORECASE)


def parse_json_loose(text: str) -> Any:
    """Parse model output that should be JSON, tolerating fences and chatter."""
    cleaned = _FENCE.sub("", text.strip())
    try:
        return json.loads(cleaned)
    except ValueError:
        pass
    for opener, closer in (("{", "}"), ("[", "]")):
        start, end = cleaned.find(opener), cleaned.rfind(closer)
        if start != -1 and end > start:
            try:
                return json.loads(cleaned[start : end + 1])
            except ValueError:
                continue
    raise ValueError("The model did not return valid JSON.")


async def complete_json(messages: list[Message], *, alias: str = "auto", max_tokens: int | None = 3000) -> Any:
    """Ask for JSON and parse it; one corrective retry if the first answer is malformed."""
    text = await complete_text(messages, alias=alias, temperature=0.2, max_tokens=max_tokens, json_mode=True)
    try:
        return parse_json_loose(text)
    except ValueError:
        retry = [*messages, {"role": "assistant", "content": text[:2000]},
                 {"role": "user", "content": "That was not valid JSON. Reply again with ONLY the JSON, no commentary."}]
        text = await complete_text(retry, alias=alias, temperature=0.0, max_tokens=max_tokens, json_mode=True)
        try:
            return parse_json_loose(text)
        except ValueError:
            raise LLMUnavailable("The AI returned an unreadable answer. Please try again.") from None
