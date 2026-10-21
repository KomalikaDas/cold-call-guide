from app.checker import _parse_model_reply, describe_call
from app.store import SupabaseStore


def reply(text):
    return {"candidates": [{"content": {"parts": [{"text": text}]}}]}


def test_parse_plain_json():
    out = _parse_model_reply(reply('{"outcome": "follow_up", "reason": "r", "summary": "s"}'))
    assert out == {"outcome": "follow_up", "reason": "r", "summary": "s"}


def test_parse_fenced_json_and_skips_thoughts():
    payload = {
        "candidates": [
            {
                "content": {
                    "parts": [
                        {"text": "thinking...", "thought": True},
                        {"text": '```json\n{"outcome": "not_interested", "reason": "r", "summary": "s"}\n```'},
                    ]
                }
            }
        ]
    }
    assert _parse_model_reply(payload)["outcome"] == "not_interested"


def test_parse_rejects_unknown_outcome_and_empty():
    assert _parse_model_reply(reply('{"outcome": "won", "reason": "r", "summary": "s"}')) is None
    assert _parse_model_reply(reply('{"outcome": "follow_up", "reason": "r", "summary": ""}')) is None
    assert _parse_model_reply({"candidates": []}) is None
    assert _parse_model_reply({}) is None


def test_describe_call_includes_words_and_choice():
    call = {
        "prospect_name": "Rajeev",
        "company": "NextGen Robotics",
        "stage_reached": 5,
        "stage_results": [
            {"stage": 5, "happened": "Named a goal or problem", "prospect_words": "skilled manpower"},
            {"stage": 1, "happened": "Right person, listening", "prospect_words": None},
        ],
    }
    text = describe_call(call, "follow_up", "Call after the 20th")
    assert text.index("1. Opening") < text.index("5. Their need")
    assert '"skilled manpower"' in text
    assert "Outcome the caller picked: follow_up" in text


def test_supabase_headers_for_both_key_types():
    new = SupabaseStore.auth_headers("sb_secret_abc")
    assert new["apikey"] == "sb_secret_abc" and "Authorization" not in new
    old = SupabaseStore.auth_headers("eyJhbGciOi.payload.sig")
    assert old["Authorization"] == "Bearer eyJhbGciOi.payload.sig"
