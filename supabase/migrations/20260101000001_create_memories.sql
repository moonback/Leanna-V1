-- ═══════════════════════════════════════════════════════════════════════════
-- Migration : création de la table memories
-- ═══════════════════════════════════════════════════════════════════════════
-- Mémoires long-terme de l'IA. Persistées par le skill `memory` et récupérées
-- par RAG sémantique via match_memories().
--
-- Dépend de : 20260101000000_extensions.sql (vector, pg_trgm)
-- Idempotente (IF NOT EXISTS / OR REPLACE).
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Table memories
create table if not exists public.memories (
    id         uuid        primary key default gen_random_uuid(),
    content    text        not null,
    tags       text[]      not null default '{}'::text[],
    project_id text        not null default '',
    embedding  vector(768),
    created_at timestamptz not null default timezone('utc'::text, now()),
    updated_at timestamptz not null default now()
);

-- 2. Index de filtrage par projet
create index if not exists memories_project_id_idx
    on public.memories (project_id);

-- 3. Index de recherche textuelle par trigrammes
create index if not exists memories_content_idx
    on public.memories using gin (content gin_trgm_ops);

-- 4. Row Level Security
alter table public.memories enable row level security;

drop policy if exists "Le backend a un accès total aux mémoires" on public.memories;
create policy "Le backend a un accès total aux mémoires"
    on public.memories
    for all
    to service_role
    using (true)
    with check (true);

-- 5. Trigger auto-update updated_at
create or replace function public.update_memories_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_memories_updated_at on public.memories;
create trigger trg_memories_updated_at
    before update on public.memories
    for each row
    execute function public.update_memories_updated_at();

-- 6. Fonction de recherche sémantique avec isolation par projet
--    p_project_id = ''  → aucun filtre (legacy, tous projets).
--    p_project_id = 'x' → mémoires du projet 'x' + globales héritées (project_id = '').
drop function if exists public.match_memories(vector(768), float, int);
create or replace function public.match_memories (
    query_embedding  vector(768),
    match_threshold  float,
    match_count      int,
    p_project_id     text default ''
)
returns table (
    id         uuid,
    content    text,
    tags       text[],
    similarity float
)
language sql stable
as $$
    select
        memories.id,
        memories.content,
        memories.tags,
        1 - (memories.embedding <=> query_embedding) as similarity
    from public.memories
    where 1 - (memories.embedding <=> query_embedding) > match_threshold
      and (
          p_project_id = ''
          or memories.project_id = p_project_id
          or memories.project_id = ''
      )
    order by similarity desc
    limit match_count;
$$;
