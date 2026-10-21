-- Cold call guide: Supabase schema
-- Run this once in the Supabase SQL editor (Project > SQL Editor > New query > Run).
-- It is safe to run again: every statement checks before it creates.

create extension if not exists pgcrypto;

-- The eight stages of a call. The backend reads stage names from here
-- when it builds the outcome check, and stage_results points at it.
create table if not exists stages (
    number      smallint primary key check (number between 1 and 8),
    name        text not null,
    purpose     text not null
);

insert into stages (number, name, purpose) values
    (1, 'Opening',               'Reach the right person and say who you are.'),
    (2, 'Purpose',               'Say why you called in words they could repeat to a colleague.'),
    (3, 'Permission',            'Get a clear yes, a clear no, or a time to call back.'),
    (4, 'Their business',        'Ask about their company before saying more about yours.'),
    (5, 'Their need',            'Hear what they want or what is in the way, in their own words.'),
    (6, 'Objection',             'Hear the reason for a no and understand it.'),
    (7, 'Next step',             'Agree one thing: what, which channel, and when.'),
    (8, 'Close',                 'End clearly and record what happened.')
on conflict (number) do update
    set name = excluded.name, purpose = excluded.purpose;

-- One row per call.
create table if not exists calls (
    id               uuid primary key default gen_random_uuid(),
    prospect_name    text not null check (char_length(prospect_name) between 1 and 120),
    company          text check (char_length(company) <= 160),
    prospect_role    text check (char_length(prospect_role) <= 120),
    caller_name      text check (char_length(caller_name) <= 80),
    status           text not null default 'open' check (status in ('open', 'closed')),
    stage_reached    smallint not null default 1 references stages(number),
    outcome          text check (outcome in (
                         'next_step_agreed', 'agreed_to_receive_report', 'interested',
                         'follow_up', 'call_again', 'not_interested', 'do_not_call',
                         'wrong_person', 'moved_company')),
    next_step        text check (char_length(next_step) <= 300),
    summary          text check (char_length(summary) <= 300),
    checked_outcome  text check (checked_outcome in (
                         'next_step_agreed', 'agreed_to_receive_report', 'interested',
                         'follow_up', 'call_again', 'not_interested', 'do_not_call',
                         'wrong_person', 'moved_company')),
    check_reason     text check (char_length(check_reason) <= 400),
    check_source     text check (check_source in ('model', 'rules')),
    started_at       timestamptz not null default now(),
    ended_at         timestamptz
);

create index if not exists calls_started_at_idx on calls (started_at desc);

-- What happened at each stage of a call. One row per call and stage;
-- going back to a stage updates its row instead of adding another.
create table if not exists stage_results (
    id              uuid primary key default gen_random_uuid(),
    call_id         uuid not null references calls(id) on delete cascade,
    stage           smallint not null references stages(number),
    happened        text check (char_length(happened) <= 160),
    tap_outcome     text check (tap_outcome in (
                        'next_step_agreed', 'agreed_to_receive_report', 'interested',
                        'follow_up', 'call_again', 'not_interested', 'do_not_call',
                        'wrong_person', 'moved_company')),
    prospect_words  text check (char_length(prospect_words) <= 2000),
    recorded_at     timestamptz not null default now(),
    unique (call_id, stage)
);

create index if not exists stage_results_call_idx on stage_results (call_id);

-- Only the backend talks to these tables, using the secret (service role) key.
-- Row level security is switched on with no policies, so the public anon key
-- that ships with every Supabase project can read or write nothing here.
alter table stages        enable row level security;
alter table calls         enable row level security;
alter table stage_results enable row level security;

grant usage on schema public to service_role;
grant select on stages to service_role;
grant select, insert, update, delete on calls, stage_results to service_role;
