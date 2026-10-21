"""Call outcomes and stage names.

The outcome words are the ones the callers already used in their own system,
so a call logged here lines up with the hundred calls we studied.
"""

OUTCOMES = {
    "next_step_agreed": "A meeting, a call at a set time, or a document plus a follow-up call was agreed",
    "agreed_to_receive_report": "The prospect agreed to receive a document on WhatsApp or email, with no time fixed",
    "interested": "The prospect said they were interested, but no next step was fixed",
    "follow_up": "The caller is to call again, because the prospect asked for it",
    "call_again": "The number is to be tried again because of language or line quality",
    "not_interested": "The prospect declined",
    "do_not_call": "The prospect asked not to be called again",
    "wrong_person": "The person reached was not the person listed, or not the right person",
    "moved_company": "The person no longer works at the listed company",
}

STAGE_NAMES = {
    1: "Opening",
    2: "Purpose",
    3: "Permission",
    4: "Their business",
    5: "Their need",
    6: "Objection",
    7: "Next step",
    8: "Close",
}
