-- Core schema. gen_random_uuid() is built into PostgreSQL 13+.

create table admin_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

create table admin_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references admin_users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  ip text,
  user_agent text
);
create index admin_sessions_user_idx on admin_sessions(user_id);

-- One row per configured external service. The API key is AES-256-GCM
-- encrypted and never leaves the server in clear text.
create table providers (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  name text not null,
  base_url text,
  api_key_cipher text,
  config jsonb not null default '{}'::jsonb,
  use_proxy boolean not null default false,
  enabled boolean not null default true,
  last_test_at timestamptz,
  last_test_ok boolean,
  last_test_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table app_settings (
  id int primary key check (id = 1),
  data jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references admin_users(id) on delete set null
);

create table settings_history (
  id bigserial primary key,
  data jsonb not null,
  created_at timestamptz not null default now(),
  created_by uuid references admin_users(id) on delete set null
);

-- Small named secrets that are not tied to a provider (e.g. the outbound proxy URL).
create table secrets (
  name text primary key,
  cipher text not null,
  updated_at timestamptz not null default now()
);

-- Uploaded images (avatar portrait and mouth sprites). Kept in the database
-- because container disks on PaaS hosts are ephemeral.
create table assets (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  mime text not null,
  data bytea not null,
  created_at timestamptz not null default now()
);

create table knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  source text not null,
  status text not null default 'ready',
  error text,
  chunk_count int not null default 0,
  char_count int not null default 0,
  created_at timestamptz not null default now()
);

create table knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references knowledge_documents(id) on delete cascade,
  idx int not null,
  content text not null,
  embedding real[],
  embedding_model text
);
create index knowledge_chunks_doc_idx on knowledge_chunks(document_id);

create table conversations (
  id uuid primary key default gen_random_uuid(),
  visitor_id text not null,
  ip text,
  user_agent text,
  message_count int not null default 0,
  created_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now()
);
create index conversations_activity_idx on conversations(last_activity_at desc);

create table messages (
  id bigserial primary key,
  conversation_id uuid not null references conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index messages_conversation_idx on messages(conversation_id, id);

create table rate_limits (
  bucket text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (bucket, window_start)
);

create table provider_events (
  id bigserial primary key,
  conversation_id uuid references conversations(id) on delete set null,
  capability text not null,
  provider_id uuid references providers(id) on delete set null,
  ok boolean not null,
  latency_ms int,
  error text,
  created_at timestamptz not null default now()
);
create index provider_events_created_idx on provider_events(created_at desc);
