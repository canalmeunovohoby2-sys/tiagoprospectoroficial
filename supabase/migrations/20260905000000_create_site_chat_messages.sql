-- Histórico persistente da conversa de cada Site Project.
create table if not exists public.site_chat_messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.site_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  text text not null default '',
  attachment jsonb,
  created_at timestamptz not null default now()
);

create index if not exists site_chat_messages_project_idx on public.site_chat_messages (project_id, created_at);

alter table public.site_chat_messages enable row level security;

drop policy if exists "site_chat_messages_select_own" on public.site_chat_messages;
create policy "site_chat_messages_select_own"
  on public.site_chat_messages for select
  using (auth.uid() = user_id);

drop policy if exists "site_chat_messages_insert_own" on public.site_chat_messages;
create policy "site_chat_messages_insert_own"
  on public.site_chat_messages for insert
  with check (auth.uid() = user_id);
