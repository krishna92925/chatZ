create extension if not exists pg_trgm;

create table profiles (
  id uuid primary key,
  email text not null,
  username text not null,
  full_name text not null,
  bio text not null default '',
  avatar_key text,
  avatar_version int not null default 0,
  connect_code text not null,
  settings jsonb not null default '{}'::jsonb,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint username_format check (username ~ '^[a-z0-9_]{3,20}$')
);
create unique index profiles_username_key on profiles (lower(username));
create unique index profiles_connect_code_key on profiles (connect_code);
create unique index profiles_email_key on profiles (lower(email));
create index profiles_username_trgm on profiles using gin (lower(username) gin_trgm_ops);
create index profiles_fullname_trgm on profiles using gin (lower(full_name) gin_trgm_ops);

create table friendships (
  id uuid primary key default gen_random_uuid(),
  user_low uuid not null references profiles(id) on delete cascade,
  user_high uuid not null references profiles(id) on delete cascade,
  requested_by uuid not null references profiles(id) on delete cascade,
  status text not null check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint friendship_order check (user_low < user_high),
  constraint friendship_pair unique (user_low, user_high)
);
create index friendships_high_idx on friendships (user_high);

create table blocks (
  blocker_id uuid not null references profiles(id) on delete cascade,
  blocked_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index blocks_blocked_idx on blocks (blocked_id);

create table conversations (
  id uuid primary key default gen_random_uuid(),
  type text not null default 'direct' check (type in ('direct', 'group')),
  name text,
  direct_key text unique,
  created_by uuid references profiles(id) on delete set null,
  last_message_id uuid,
  last_message_at timestamptz,
  created_at timestamptz not null default now()
);

create table conversation_members (
  conversation_id uuid not null references conversations(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  last_read_seq bigint not null default 0,
  unread_count int not null default 0,
  muted boolean not null default false,
  pinned boolean not null default false,
  archived boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index conversation_members_user_idx on conversation_members (user_id);

create table messages (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_id uuid not null references profiles(id) on delete cascade,
  kind text not null default 'text' check (kind in ('text', 'image', 'video', 'file')),
  body text not null default '',
  attachments jsonb not null default '[]'::jsonb,
  reply_to_id uuid references messages(id) on delete set null,
  client_id text,
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index messages_seq_key on messages (seq);
create index messages_conversation_seq_idx on messages (conversation_id, seq desc);
create unique index messages_client_key on messages (sender_id, client_id) where client_id is not null;
create index messages_body_trgm on messages using gin (body gin_trgm_ops);

create table message_deletions (
  message_id uuid not null references messages(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  primary key (message_id, user_id)
);

create table reactions (
  message_id uuid not null references messages(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

create table uploads (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  key text not null unique,
  kind text not null check (kind in ('image', 'video', 'file')),
  mime text not null,
  size bigint not null,
  name text not null,
  width int,
  height int,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index uploads_owner_idx on uploads (owner_id);
create index uploads_unused_idx on uploads (created_at) where used_at is null;
