-- ═══════════════════════════════════════════════════════════════════════════
-- Migration : création des tables conversations et conversation_messages
-- ═══════════════════════════════════════════════════════════════════════════
-- Sessions de conversation entre l'utilisateur et l'IA, avec leurs messages.
-- Dépend de : 20260101000000_extensions.sql (pg_trgm pour le GIN fts)
-- Idempotente (IF NOT EXISTS / OR REPLACE).
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Table conversations
create table if not exists public.conversations (
    id            uuid        primary key default gen_random_uuid(),
    title         text,
    summary       text,
    started_at    timestamptz not null default timezone('utc'::text, now()),
    ended_at      timestamptz,
    message_count integer     default 0,
    created_at    timestamptz not null default timezone('utc'::text, now())
);

alter table public.conversations enable row level security;

drop policy if exists "Service role full access on conversations" on public.conversations;
create policy "Service role full access on conversations"
    on public.conversations
    for all
    to service_role
    using (true)
    with check (true);

-- 2. Table conversation_messages
create table if not exists public.conversation_messages (
    id              uuid        primary key default gen_random_uuid(),
    conversation_id uuid        not null references public.conversations(id) on delete cascade,
    role            text        not null check (role in ('user', 'assistant')),
    content         text        not null,
    created_at      timestamptz not null default timezone('utc'::text, now())
);

alter table public.conversation_messages enable row level security;

drop policy if exists "Service role full access on conversation_messages" on public.conversation_messages;
create policy "Service role full access on conversation_messages"
    on public.conversation_messages
    for all
    to service_role
    using (true)
    with check (true);

-- Index pour accélérer les jointures par conversation
create index if not exists idx_conversation_messages_conversation_id
    on public.conversation_messages (conversation_id);

-- Index pour la recherche full-text en français
create index if not exists idx_conversation_messages_content_search
    on public.conversation_messages using gin (to_tsvector('french', content));

-- 3. Fonction de recherche full-text dans l'historique
create or replace function public.search_conversations(
    search_query text,
    result_limit int default 20
)
returns table (
    message_id          uuid,
    conversation_id     uuid,
    conversation_title  text,
    role                text,
    content             text,
    created_at          timestamptz,
    rank                real
)
language plpgsql
as $$
begin
    return query
    select
        cm.id                                                                           as message_id,
        cm.conversation_id,
        c.title                                                                         as conversation_title,
        cm.role,
        cm.content,
        cm.created_at,
        ts_rank(to_tsvector('french', cm.content), plainto_tsquery('french', search_query)) as rank
    from public.conversation_messages cm
    join public.conversations c on c.id = cm.conversation_id
    where to_tsvector('french', cm.content) @@ plainto_tsquery('french', search_query)
    order by rank desc, cm.created_at desc
    limit result_limit;
end;
$$;
