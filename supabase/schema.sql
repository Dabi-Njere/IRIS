-- IRIS — Supabase schema
-- Run this in the Supabase SQL editor (or via the CLI) on a fresh project.

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('sms', 'whatsapp')),
  contact_identifier text not null,      -- phone number (SMS) or WhatsApp display name
  contact_name text,                     -- friendly label if known
  trusted boolean not null default false, -- saved/known contact vs unknown number
  opener_asked boolean not null default false,
  decision_pending boolean not null default false,
  decision_made text,                    -- 'approved' | 'declined' | null
  viewing_slots_offered boolean not null default false,
  viewing_confirmed boolean not null default false,
  summary text,                          -- rolling conversation summary
  last_summarized_at int not null default 0, -- message count at last summarization
  created_at timestamptz not null default now(),
  unique (channel, contact_identifier)
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  direction text not null check (direction in ('incoming', 'outgoing')),
  body text not null,
  category text,             -- RENTAL_INQUIRY | WORK | PERSONAL | GENERAL_CONVERSATION | SPAM | OTHER
  intent text,
  status text not null default 'received', -- received|drafted|approved|sent|send_failed|rejected
  auto_sent boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists applicants (
  conversation_id uuid primary key references conversations(id) on delete cascade,
  name text,
  move_in_date text,
  occupants int,
  has_pets boolean,
  pet_details text,
  smoker boolean,
  employment_status text,
  income_verification_ok boolean,
  credit_check_ok boolean,
  viewing_requested_time text,
  qualification_score int,
  updated_at timestamptz not null default now()
);

create table if not exists decisions (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  type text not null check (type in ('qualify', 'viewing')),
  slot text,                  -- only for type='viewing'
  status text not null default 'pending', -- pending|resolved
  outcome text,                -- 'approved' | 'declined', once resolved
  draft_message text,          -- editable proposed message
  created_at timestamptz not null default now()
);

create table if not exists scheduled_rules (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  send_time text not null,     -- 'HH:MM', 24hr, local to the owner
  theme text not null,
  last_sent_date date,
  created_at timestamptz not null default now()
);

create table if not exists style_examples (
  id uuid primary key default gen_random_uuid(),
  original text not null,
  edited text not null,
  created_at timestamptz not null default now()
);

-- Helpful indexes for the dashboard's common queries
create index if not exists idx_messages_conversation on messages(conversation_id, created_at);
create index if not exists idx_decisions_status on decisions(status);
create index if not exists idx_conversations_channel on conversations(channel);

-- Row Level Security: locked down by default. Since this is a personal
-- single-owner app, the simplest safe approach is: no public access at all,
-- and the Vercel backend talks to Supabase using the service role key
-- (server-side only, never shipped to the Android app or browser).
alter table conversations enable row level security;
alter table messages enable row level security;
alter table applicants enable row level security;
alter table decisions enable row level security;
alter table scheduled_rules enable row level security;
alter table style_examples enable row level security;
-- No policies are created here on purpose — with RLS enabled and zero
-- policies, only the service role key can read/write. If you later add a
-- real multi-user dashboard with Supabase Auth, add per-owner policies then.
