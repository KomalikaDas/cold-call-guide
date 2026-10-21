from __future__ import annotations

import logging
import uuid
from contextlib import asynccontextmanager
from typing import Literal

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator

from .checker import OutcomeChecker
from .config import load_settings
from .outcomes import OUTCOMES
from .store import MemoryStore, StoreError, SupabaseStore

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logging.getLogger("httpx").setLevel(logging.WARNING)
log = logging.getLogger("callguide")

Outcome = Literal[
    "next_step_agreed",
    "agreed_to_receive_report",
    "interested",
    "follow_up",
    "call_again",
    "not_interested",
    "do_not_call",
    "wrong_person",
    "moved_company",
]


def _clean(value):
    if isinstance(value, str):
        value = value.strip()
        return value or None
    return value


class StartCall(BaseModel):
    prospect_name: str = Field(min_length=1, max_length=120)
    company: str | None = Field(default=None, max_length=160)
    prospect_role: str | None = Field(default=None, max_length=120)
    caller_name: str | None = Field(default=None, max_length=80)

    @field_validator("prospect_name", mode="before")
    @classmethod
    def strip_name(cls, v):
        return v.strip() if isinstance(v, str) else v

    @field_validator("company", "prospect_role", "caller_name", mode="before")
    @classmethod
    def strip_optional(cls, v):
        return _clean(v)


class StageResult(BaseModel):
    stage: int = Field(ge=1, le=8)
    happened: str | None = Field(default=None, max_length=160)
    tap_outcome: Outcome | None = None
    prospect_words: str | None = Field(default=None, max_length=2000)

    @field_validator("happened", "prospect_words", mode="before")
    @classmethod
    def strip_text(cls, v):
        return _clean(v)


class CheckRequest(BaseModel):
    outcome: Outcome
    next_step: str | None = Field(default=None, max_length=300)

    @field_validator("next_step", mode="before")
    @classmethod
    def strip_text(cls, v):
        return _clean(v)


class CheckResult(BaseModel):
    suggested_outcome: Outcome
    matches: bool
    reason: str = Field(default="", max_length=400)
    summary: str = Field(default="", max_length=300)
    source: Literal["model", "rules"]


class CloseCall(BaseModel):
    outcome: Outcome
    next_step: str | None = Field(default=None, max_length=300)
    summary: str | None = Field(default=None, max_length=300)
    check: CheckResult | None = None

    @field_validator("next_step", "summary", mode="before")
    @classmethod
    def strip_text(cls, v):
        return _clean(v)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = load_settings()
    if settings.uses_database:
        app.state.store = SupabaseStore(settings.supabase_url, settings.supabase_key)
    else:
        log.warning("SUPABASE_URL or SUPABASE_SECRET_KEY not set: calls are kept in memory only")
        app.state.store = MemoryStore()
    app.state.checker = OutcomeChecker(
        settings.gemini_api_key, settings.gemini_model, settings.gemini_fallback_model
    )
    if not app.state.checker.enabled:
        log.warning("GEMINI_API_KEY not set: the outcome check uses plain rules")
    yield
    await app.state.store.aclose()
    await app.state.checker.aclose()


settings_at_import = load_settings()
app = FastAPI(title="Cold call guide API", version="1.0.0", lifespan=lifespan)

_any_origin = "*" in settings_at_import.allowed_origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if _any_origin else settings_at_import.allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)


@app.exception_handler(StoreError)
async def store_error(request: Request, exc: StoreError):
    log.error("store error on %s %s: %s", request.method, request.url.path, exc)
    return JSONResponse(status_code=503, content={"detail": "The database is not reachable right now."})


async def _get_call_or_404(request: Request, call_id: uuid.UUID) -> dict:
    call = await request.app.state.store.get_call(str(call_id))
    if call is None:
        raise HTTPException(status_code=404, detail="Call not found.")
    return call


@app.get("/")
async def root():
    return {"service": "cold call guide api", "health": "/health"}


@app.get("/health")
async def health(request: Request):
    store = request.app.state.store
    try:
        await store.ping()
        database = "ok"
    except StoreError as exc:
        log.error("health check could not reach the database: %s", exc)
        database = "unreachable"
    return {
        "status": "ok",
        "storage": store.kind,
        "database": database,
        "outcome_check": "model" if request.app.state.checker.enabled else "rules",
    }


@app.get("/outcomes")
async def outcomes():
    return OUTCOMES


@app.post("/calls", status_code=201)
async def start_call(body: StartCall, request: Request):
    return await request.app.state.store.create_call(body.model_dump())


@app.get("/calls")
async def list_calls(request: Request, limit: int = Query(default=50, ge=1, le=200)):
    return await request.app.state.store.list_calls(limit)


@app.get("/calls/{call_id}")
async def get_call(call_id: uuid.UUID, request: Request):
    return await _get_call_or_404(request, call_id)


@app.post("/calls/{call_id}/stages")
async def save_stage(call_id: uuid.UUID, body: StageResult, request: Request):
    await _get_call_or_404(request, call_id)
    return await request.app.state.store.save_stage(str(call_id), body.model_dump())


@app.post("/calls/{call_id}/check")
async def check_call(call_id: uuid.UUID, body: CheckRequest, request: Request):
    call = await _get_call_or_404(request, call_id)
    return await request.app.state.checker.check(call, body.outcome, body.next_step)


@app.post("/calls/{call_id}/close")
async def close_call(call_id: uuid.UUID, body: CloseCall, request: Request):
    call = await _get_call_or_404(request, call_id)
    check = body.check.model_dump() if body.check else None
    if check is None:
        # The screen normally runs the check first; if it did not, run it here
        # so every saved call carries one.
        check = await request.app.state.checker.check(call, body.outcome, body.next_step)
    fields = {
        "outcome": body.outcome,
        "next_step": body.next_step,
        "summary": body.summary or check["summary"] or None,
        "checked_outcome": check["suggested_outcome"],
        "check_reason": (check.get("reason") or None),
        "check_source": check["source"],
    }
    return await request.app.state.store.close_call(str(call_id), fields)
