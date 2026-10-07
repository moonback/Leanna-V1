-- Migration : isolation de la mémoire long-terme par projet
--
-- Ajoute un `project_id` aux mémoires et met à jour la fonction de recherche
-- sémantique pour filtrer par projet. Sûre à rejouer (idempotente) et sans
-- impact sur les données existantes : les mémoires antérieures reçoivent
-- project_id = '' (globales/héritées) et restent visibles depuis tous les
-- projets.
--
-- À exécuter dans le SQL editor Supabase du projet concerné.

-- 1. Colonne project_id (idempotent).
alter table public.memories
  add column if not exists project_id text not null default '';

-- 2. Index de filtrage par projet.
create index if not exists memories_project_id_idx on public.memories(project_id);

-- 3. Fonction de recherche sémantique isolée par projet.
--    p_project_id = ''  → aucun filtre (legacy, tous projets).
--    p_project_id = 'x' → mémoires du projet 'x' + globales héritées (project_id = '').
--    L'ancienne signature à 3 arguments est supprimée pour lever l'ambiguïté
--    de surcharge (tous les appelants passent désormais p_project_id).
drop function if exists match_memories(vector(768), float, int);

create or replace function match_memories (
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  p_project_id text default ''
)
returns table (
  id uuid,
  content text,
  tags text[],
  similarity float
)
language sql stable
as $$
  select
    memories.id,
    memories.content,
    memories.tags,
    1 - (memories.embedding <=> query_embedding) as similarity
  from memories
  where 1 - (memories.embedding <=> query_embedding) > match_threshold
    and (
      p_project_id = ''
      or memories.project_id = p_project_id
      or memories.project_id = ''
    )
  order by similarity desc
  limit match_count;
$$;
