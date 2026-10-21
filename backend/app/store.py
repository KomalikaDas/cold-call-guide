"""Where calls are kept.

SupabaseStore talks to Supabase over its REST API (PostgREST) with the
project's secret key. MemoryStore keeps everything in a dict and is only
for running the backend on a laptop without a database.
"""

from __future__ import annotations

import copy
import uuid
from datetime import datetime, timezone

import httpx


class StoreError(Exception):
    """The database could not be reached or refused the request."""


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def counts_as_reached(stage: int) -> bool:
    # Every call passes through Close (stage 8), so it says nothing about how
    # far the conversation got. "Stage reached" is the furthest of stages 1-7.
    return stage < 8


class SupabaseStore:
    kind = "supabase"

    def __init__(self, url: str, key: str, client: httpx.AsyncClient | None = None):
        self._base = f"{url}/rest/v1"
        self._headers = self.auth_headers(key)
        self._client = client or httpx.AsyncClient(timeout=10)

    @staticmethod
    def auth_headers(key: str) -> dict[str, str]:
        # New Supabase keys (sb_secret_...) are not JWTs and go only in `apikey`.
        # Older service_role keys are JWTs and also need the Authorization header.
        headers = {"apikey": key, "Content-Type": "application/json"}
        if not key.startswith("sb_"):
            headers["Authorization"] = f"Bearer {key}"
        return headers

    async def _request(self, method: str, path: str, *, params=None, json=None, prefer=None):
        headers = dict(self._headers)
        if prefer:
            headers["Prefer"] = prefer
        try:
            response = await self._client.request(
                method, f"{self._base}/{path}", params=params, json=json, headers=headers
            )
        except httpx.HTTPError as exc:
            raise StoreError(f"could not reach the database: {exc.__class__.__name__}") from exc
        if response.status_code >= 400:
            raise StoreError(f"database said {response.status_code}: {response.text[:300]}")
        if not response.content:
            return None
        return response.json()

    async def ping(self) -> bool:
        await self._request("GET", "stages", params={"select": "number", "limit": "1"})
        return True

    async def create_call(self, data: dict) -> dict:
        rows = await self._request("POST", "calls", json=data, prefer="return=representation")
        call = rows[0]
        call["stage_results"] = []
        return call

    async def get_call(self, call_id: str) -> dict | None:
        rows = await self._request(
            "GET",
            "calls",
            params={
                "id": f"eq.{call_id}",
                "select": "*,stage_results(*)",
                "stage_results.order": "stage.asc",
            },
        )
        return rows[0] if rows else None

    async def save_stage(self, call_id: str, result: dict) -> dict:
        body = {"call_id": call_id, "recorded_at": now_iso(), **result}
        rows = await self._request(
            "POST",
            "stage_results",
            params={"on_conflict": "call_id,stage"},
            json=body,
            prefer="resolution=merge-duplicates,return=representation",
        )
        if counts_as_reached(result["stage"]):
            # Move the call's furthest stage forward, never back.
            await self._request(
                "PATCH",
                "calls",
                params={"id": f"eq.{call_id}", "stage_reached": f"lt.{result['stage']}"},
                json={"stage_reached": result["stage"]},
            )
        return rows[0]

    async def close_call(self, call_id: str, fields: dict) -> dict | None:
        body = {**fields, "status": "closed", "ended_at": now_iso()}
        rows = await self._request(
            "PATCH",
            "calls",
            params={"id": f"eq.{call_id}"},
            json=body,
            prefer="return=representation",
        )
        return rows[0] if rows else None

    async def list_calls(self, limit: int) -> list[dict]:
        return await self._request(
            "GET",
            "calls",
            params={"select": "*", "order": "started_at.desc", "limit": str(limit)},
        )

    async def aclose(self):
        await self._client.aclose()


class MemoryStore:
    kind = "memory"

    def __init__(self):
        self._calls: dict[str, dict] = {}

    async def ping(self) -> bool:
        return True

    async def create_call(self, data: dict) -> dict:
        call = {
            "id": str(uuid.uuid4()),
            "company": None,
            "prospect_role": None,
            "caller_name": None,
            **data,
            "status": "open",
            "stage_reached": 1,
            "outcome": None,
            "next_step": None,
            "summary": None,
            "checked_outcome": None,
            "check_reason": None,
            "check_source": None,
            "started_at": now_iso(),
            "ended_at": None,
            "stage_results": [],
        }
        self._calls[call["id"]] = call
        return copy.deepcopy(call)

    async def get_call(self, call_id: str) -> dict | None:
        call = self._calls.get(call_id)
        if call is None:
            return None
        call = copy.deepcopy(call)
        call["stage_results"].sort(key=lambda r: r["stage"])
        return call

    async def save_stage(self, call_id: str, result: dict) -> dict:
        call = self._calls[call_id]
        existing = next((r for r in call["stage_results"] if r["stage"] == result["stage"]), None)
        if existing is None:
            existing = {"id": str(uuid.uuid4()), "call_id": call_id}
            call["stage_results"].append(existing)
        existing.update(result, recorded_at=now_iso())
        if counts_as_reached(result["stage"]):
            call["stage_reached"] = max(call["stage_reached"], result["stage"])
        return copy.deepcopy(existing)

    async def close_call(self, call_id: str, fields: dict) -> dict | None:
        call = self._calls.get(call_id)
        if call is None:
            return None
        call.update(fields, status="closed", ended_at=now_iso())
        return {k: v for k, v in copy.deepcopy(call).items() if k != "stage_results"}

    async def list_calls(self, limit: int) -> list[dict]:
        calls = sorted(self._calls.values(), key=lambda c: c["started_at"], reverse=True)
        return [
            {k: v for k, v in copy.deepcopy(c).items() if k != "stage_results"}
            for c in calls[:limit]
        ]

    async def aclose(self):
        return None
