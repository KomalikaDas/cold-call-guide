"""The outcome check that runs before a call is saved.

In the hundred calls we read, about a third of the logged outcomes were empty
or did not match what was said, and every call logged as do_not_call turned
out to be something else. So before a caller saves a call, the backend reads
the record of the call back (the taps and the prospect's words), says which
outcome it supports, and drafts the one-line summary for the past-calls list.

The caller always has the last word. If the model is not configured or does
not answer properly, a few plain rules do the check instead, so closing a
call never depends on the model being up.
"""

from __future__ import annotations

import json
import logging

import httpx

from .outcomes import OUTCOMES, STAGE_NAMES

log = logging.getLogger("callguide.checker")

GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

INSTRUCTIONS = """You review the record of one sales cold call before it is saved.
The caller works for a company that sells growth work to Indian businesses.
The record lists, stage by stage, what the caller tapped and the prospect's own words.

Your job:
1. Pick the one outcome from the list that the record supports best.
2. Say in one short sentence why, pointing at what is in the record.
3. Write a summary of the call in at most 18 words, plain and factual, no adjectives.
   Mention the next step with its time or channel if one was agreed.

Rules:
- Judge only from the record. Do not invent facts.
- "do_not_call" only if the prospect asked not to be called again.
- If someone else was named as the right contact, that is "wrong_person".
- A document plus a fixed time to talk again is "next_step_agreed".
- A document with no time fixed is "agreed_to_receive_report".

Outcomes:
{outcomes}

Reply with JSON only, in this shape:
{{"outcome": "<one outcome key>", "reason": "<one sentence>", "summary": "<at most 18 words>"}}"""


def describe_call(call: dict, chosen_outcome: str, next_step: str | None) -> str:
    lines = [
        f"Prospect: {call.get('prospect_name')}"
        + (f", {call['prospect_role']}" if call.get("prospect_role") else "")
        + (f", {call['company']}" if call.get("company") else ""),
        f"Furthest stage reached: {call.get('stage_reached')} ({STAGE_NAMES.get(call.get('stage_reached'), '')})",
        "",
        "Stages:",
    ]
    results = sorted(call.get("stage_results") or [], key=lambda r: r["stage"])
    if not results:
        lines.append("(nothing recorded)")
    for r in results:
        name = STAGE_NAMES.get(r["stage"], str(r["stage"]))
        happened = r.get("happened") or "nothing tapped"
        lines.append(f"- {r['stage']}. {name}: {happened}")
        if r.get("prospect_words"):
            lines.append(f'  Prospect said: "{r["prospect_words"]}"')
    lines += [
        "",
        f"Next step written by the caller: {next_step or '(none)'}",
        f"Outcome the caller picked: {chosen_outcome}",
    ]
    return "\n".join(lines)


def rules_check(call: dict, chosen_outcome: str, next_step: str | None) -> dict:
    results = sorted(call.get("stage_results") or [], key=lambda r: r["stage"])
    tapped = [r for r in results if r.get("tap_outcome")]
    suggested = tapped[-1]["tap_outcome"] if tapped else chosen_outcome
    reason = (
        f"The last tap that points to an outcome was at {STAGE_NAMES[tapped[-1]['stage']]}: "
        f"\"{tapped[-1].get('happened')}\"."
        if tapped
        else "No tap on this call points to a particular outcome."
    )

    asked_no_calls = any(r.get("tap_outcome") == "do_not_call" for r in results)
    if chosen_outcome == "do_not_call" and not asked_no_calls:
        # No tap says do_not_call here, so the last tap (if any) is a better guess.
        suggested = tapped[-1]["tap_outcome"] if tapped else "not_interested"
        reason = "Nothing in the record says the prospect asked not to be called again."

    furthest = STAGE_NAMES.get(call.get("stage_reached"), "")
    detail = next_step or (results[-1].get("happened") if results else None) or "nothing recorded"
    summary = f"Reached {furthest}. {detail}."[:160]

    return {
        "suggested_outcome": suggested,
        "matches": suggested == chosen_outcome,
        "reason": reason,
        "summary": summary,
        "source": "rules",
    }


def _parse_model_reply(payload: dict) -> dict | None:
    try:
        parts = payload["candidates"][0]["content"]["parts"]
    except (KeyError, IndexError, TypeError):
        return None
    text = "".join(p.get("text", "") for p in parts if not p.get("thought"))
    text = text.strip()
    if text.startswith("```"):
        text = text.strip("`")
        text = text[text.find("{"):]
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        start, end = text.find("{"), text.rfind("}")
        if start < 0 or end <= start:
            return None
        try:
            data = json.loads(text[start : end + 1])
        except json.JSONDecodeError:
            return None
    if not isinstance(data, dict):
        return None
    outcome = str(data.get("outcome", "")).strip()
    reason = str(data.get("reason", "")).strip()
    summary = str(data.get("summary", "")).strip()
    if outcome not in OUTCOMES or not summary:
        return None
    return {"outcome": outcome, "reason": reason[:400], "summary": summary[:300]}


class OutcomeChecker:
    def __init__(self, api_key: str, model: str, fallback_model: str, client: httpx.AsyncClient | None = None):
        self.api_key = api_key
        self.models = [m for m in (model, fallback_model) if m]
        self._client = client or httpx.AsyncClient(timeout=20)

    @property
    def enabled(self) -> bool:
        return bool(self.api_key and self.models)

    async def _ask(self, model: str, record: str) -> dict | None:
        outcomes = "\n".join(f"- {k}: {v}" for k, v in OUTCOMES.items())
        body = {
            "systemInstruction": {"parts": [{"text": INSTRUCTIONS.format(outcomes=outcomes)}]},
            "contents": [{"role": "user", "parts": [{"text": record}]}],
            "generationConfig": {"temperature": 0.2, "responseMimeType": "application/json"},
        }
        response = await self._client.post(
            GEMINI_URL.format(model=model),
            headers={"x-goog-api-key": self.api_key, "Content-Type": "application/json"},
            json=body,
        )
        if response.status_code != 200:
            log.warning("model %s answered %s: %s", model, response.status_code, response.text[:200])
            return None
        return _parse_model_reply(response.json())

    async def check(self, call: dict, chosen_outcome: str, next_step: str | None) -> dict:
        if self.enabled:
            record = describe_call(call, chosen_outcome, next_step)
            for model in self.models:
                try:
                    reply = await self._ask(model, record)
                except httpx.HTTPError as exc:
                    log.warning("model %s failed: %s", model, exc.__class__.__name__)
                    reply = None
                if reply:
                    return {
                        "suggested_outcome": reply["outcome"],
                        "matches": reply["outcome"] == chosen_outcome,
                        "reason": reply["reason"],
                        "summary": reply["summary"],
                        "source": "model",
                    }
        return rules_check(call, chosen_outcome, next_step)

    async def aclose(self):
        await self._client.aclose()
