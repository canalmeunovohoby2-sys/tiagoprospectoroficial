-- Tabela principal: transcript completo da conversa do Cline Agent (incluir tool_calls/resultados/arquivos)
create table if not exists public.agent_conversation_memory (
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.site_projects(id) on delete cascade,
  conversation_id uuid not null,
  messages jsonb not null default '[]'::jsonb,
  files_changed text[] default '{}'::text[],
  model text,
  provider text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, project_id, conversation_id)
);
create index if not exists agent_conversation_memory_user_project_idx on public.agent_conversation_memory (user_id, project_id);
create index if not exists agent_conversation_memory_conv_idx on public.agent_conversation_memory (user_id, project_id, conversation_id);

-- Adiciona conversation_id ao site_chat_messages para isolamento entre conversas do mesmo projeto
alter table public.site_chat_messages add column if not exists conversation_id uuid;
create index if not exists site_chat_messages_conversation_idx on public.site_chat_messages (conversation_id, created_at);
