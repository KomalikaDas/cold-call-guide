"""API tests against the in-memory store, with the model replaced by a fake."""

import json

import httpx
import pytest
from fastapi.testclient import TestClient

from app.checker import OutcomeChecker
from app.main import app


def fake_gemini(reply_text: str, status: int = 200):
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["x-goog-api-key"] == "test-key"
        body = json.loads(request.content)
        assert "Outcome the caller picked" in body["contents"][0]["parts"][0]["text"]
        if status != 200:
            return httpx.Response(status, json={"error": {"message": "nope"}})
        return httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": reply_text}]}}]})

    return handler


@pytest.fixture
def client(monkeypatch):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SECRET_KEY", raising=False)
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    with TestClient(app) as c:
        yield c


def start(client, **extra):
    r = client.post("/calls", json={"prospect_name": "Ayesha Khan", "company": "Vijay Writing Instruments", **extra})
    assert r.status_code == 201, r.text
    return r.json()


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "storage": "memory", "database": "ok", "outcome_check": "rules"}


def test_start_call_validates_name(client):
    assert client.post("/calls", json={"prospect_name": "   "}).status_code == 422
    assert client.post("/calls", json={}).status_code == 422


def test_full_call_flow(client):
    call = start(client, prospect_role="Director")
    cid = call["id"]
    assert call["status"] == "open" and call["stage_reached"] == 1

    client.post(f"/calls/{cid}/stages", json={"stage": 1, "happened": "Right person, listening"})
    client.post(f"/calls/{cid}/stages", json={"stage": 2, "happened": "Asked where we're calling from"})
    r = client.post(
        f"/calls/{cid}/stages",
        json={"stage": 5, "happened": "Named a goal or problem", "prospect_words": "  sales flat for three years  "},
    )
    assert r.status_code == 200
    assert r.json()["prospect_words"] == "sales flat for three years"

    # Going back to an earlier stage keeps the furthest stage reached.
    client.post(f"/calls/{cid}/stages", json={"stage": 2, "happened": "Understood, go on"})
    full = client.get(f"/calls/{cid}").json()
    assert full["stage_reached"] == 5
    assert [s["stage"] for s in full["stage_results"]] == [1, 2, 5]
    assert full["stage_results"][1]["happened"] == "Understood, go on"

    client.post(
        f"/calls/{cid}/stages",
        json={"stage": 7, "happened": "Document plus a call at a set time", "tap_outcome": "next_step_agreed"},
    )
    check = client.post(f"/calls/{cid}/check", json={"outcome": "do_not_call", "next_step": "Call Thursday"}).json()
    assert check["source"] == "rules"
    assert check["suggested_outcome"] == "next_step_agreed"
    assert check["matches"] is False

    closed = client.post(
        f"/calls/{cid}/close", json={"outcome": "next_step_agreed", "next_step": "Call Thursday", "check": check}
    )
    assert closed.status_code == 200, closed.text
    body = closed.json()
    assert body["status"] == "closed" and body["ended_at"]
    assert body["checked_outcome"] == "next_step_agreed"
    assert body["summary"]

    listed = client.get("/calls").json()
    assert listed[0]["id"] == cid and listed[0]["outcome"] == "next_step_agreed"
    assert "stage_results" not in listed[0]


def test_close_stage_does_not_count_as_reached(client):
    cid = start(client)["id"]
    client.post(f"/calls/{cid}/stages", json={"stage": 3, "happened": "Call back at a time they named", "tap_outcome": "follow_up"})
    client.post(f"/calls/{cid}/stages", json={"stage": 8, "happened": "Clear goodbye"})
    full = client.get(f"/calls/{cid}").json()
    assert full["stage_reached"] == 3
    assert [s["stage"] for s in full["stage_results"]] == [3, 8]


def test_close_without_check_runs_one(client):
    cid = start(client)["id"]
    client.post(f"/calls/{cid}/stages", json={"stage": 1, "happened": "Moved company", "tap_outcome": "moved_company"})
    body = client.post(f"/calls/{cid}/close", json={"outcome": "moved_company"}).json()
    assert body["check_source"] == "rules"
    assert body["checked_outcome"] == "moved_company"


def test_rules_flag_do_not_call_without_a_reason(client):
    cid = start(client)["id"]
    client.post(f"/calls/{cid}/stages", json={"stage": 6, "happened": "Not the right person", "tap_outcome": "wrong_person"})
    check = client.post(f"/calls/{cid}/check", json={"outcome": "do_not_call"}).json()
    assert check["suggested_outcome"] == "wrong_person"
    assert "asked not to be called" in check["reason"]


def test_bad_input(client):
    cid = start(client)["id"]
    assert client.post(f"/calls/{cid}/stages", json={"stage": 9}).status_code == 422
    assert client.post(f"/calls/{cid}/stages", json={"stage": 2, "tap_outcome": "maybe"}).status_code == 422
    assert client.post(f"/calls/{cid}/close", json={"outcome": "sold"}).status_code == 422
    assert client.get("/calls/not-a-uuid").status_code == 422
    assert client.get("/calls/00000000-0000-0000-0000-000000000000").status_code == 404
    assert client.post("/calls/00000000-0000-0000-0000-000000000000/stages", json={"stage": 1}).status_code == 404


def test_model_check_is_used_when_it_answers(client):
    reply = '{"outcome": "agreed_to_receive_report", "reason": "They asked for it on WhatsApp.", "summary": "Agreed to receive the report on WhatsApp."}'
    app.state.checker = OutcomeChecker(
        "test-key", "model-a", "model-b", client=httpx.AsyncClient(transport=httpx.MockTransport(fake_gemini(reply)))
    )
    cid = start(client)["id"]
    client.post(f"/calls/{cid}/stages", json={"stage": 7, "happened": "Document on WhatsApp", "prospect_words": "send it on this number"})
    check = client.post(f"/calls/{cid}/check", json={"outcome": "interested"}).json()
    assert check == {
        "suggested_outcome": "agreed_to_receive_report",
        "matches": False,
        "reason": "They asked for it on WhatsApp.",
        "summary": "Agreed to receive the report on WhatsApp.",
        "source": "model",
    }


@pytest.mark.parametrize(
    "reply,status",
    [
        ("not json at all", 200),
        ('{"outcome": "sold", "reason": "x", "summary": "y"}', 200),
        ("{}", 429),
    ],
)
def test_model_failures_fall_back_to_rules(client, reply, status):
    app.state.checker = OutcomeChecker(
        "test-key", "model-a", "model-b",
        client=httpx.AsyncClient(transport=httpx.MockTransport(fake_gemini(reply, status))),
    )
    cid = start(client)["id"]
    check = client.post(f"/calls/{cid}/check", json={"outcome": "interested"}).json()
    assert check["source"] == "rules"


def test_model_network_error_falls_back(client):
    def boom(request):
        raise httpx.ConnectError("down")

    app.state.checker = OutcomeChecker("test-key", "m", "", client=httpx.AsyncClient(transport=httpx.MockTransport(boom)))
    cid = start(client)["id"]
    assert client.post(f"/calls/{cid}/check", json={"outcome": "interested"}).json()["source"] == "rules"


def test_cors_preflight(client):
    r = client.options(
        "/calls",
        headers={"Origin": "https://example.vercel.app", "Access-Control-Request-Method": "POST",
                 "Access-Control-Request-Headers": "content-type"},
    )
    assert r.status_code == 200
    assert r.headers["access-control-allow-origin"] in ("*", "https://example.vercel.app")
