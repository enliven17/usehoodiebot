-- HOODIEBOT. One team per owner (the EVM address that signed in). Amounts in wei / raw token units as numeric.
create table if not exists teams (
  owner text primary key,
  wallet text not null unique,
  wallet_id text not null,
  policy_id text not null,
  -- one transaction at a time per wallet (nonces): a lease, since the HTTP driver holds no session
  busy_until timestamptz,
  created_at timestamptz not null default now()
);

-- The conversation, stored as the API's own content blocks so thinking blocks go back unchanged.
create table if not exists messages (
  id bigserial primary key,
  owner text not null references teams(owner),
  role text not null check (role in ('user', 'assistant')),
  content jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists messages_owner on messages(owner, id);

create table if not exists strategies (
  id uuid primary key default gen_random_uuid(),
  owner text not null references teams(owner),
  name text not null,
  spec jsonb not null,
  mode text not null default 'ask' check (mode in ('ask', 'auto')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- A token a strategy already matched: never matched twice.
create table if not exists matches (
  strategy_id uuid not null references strategies(id) on delete cascade,
  token text not null,
  created_at timestamptz not null default now(),
  primary key (strategy_id, token)
);

-- Trades waiting for the owner's yes. Expire after a while instead of trading late.
create table if not exists approvals (
  id uuid primary key default gen_random_uuid(),
  owner text not null references teams(owner),
  strategy_id uuid references strategies(id) on delete set null,
  kind text not null check (kind in ('buy', 'sell')),
  token text not null,
  symbol text not null,
  amount numeric not null,
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'skipped', 'expired', 'done', 'failed')),
  result jsonb,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index if not exists approvals_owner on approvals(owner, status);

create table if not exists positions (
  id uuid primary key default gen_random_uuid(),
  owner text not null references teams(owner),
  strategy_id uuid references strategies(id) on delete set null,
  token text not null,
  symbol text not null,
  tokens numeric not null,
  cost_wei numeric not null,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  proceeds_wei numeric
);
create index if not exists positions_open on positions(owner) where closed_at is null;

create table if not exists trades (
  id bigserial primary key,
  owner text not null references teams(owner),
  side text not null check (side in ('buy', 'sell')),
  token text not null,
  symbol text not null,
  wei numeric not null,
  tokens numeric not null,
  hash text not null,
  created_at timestamptz not null default now()
);

alter table teams add column if not exists busy_until timestamptz;
