-- ═══════════════════════════════════════════════════════════════════════════
-- Migration : création de la table lists
-- ═══════════════════════════════════════════════════════════════════════════
-- Listes intelligentes gérées par l'IA (to-do, courses, notes structurées…).
-- Idempotente (IF NOT EXISTS).
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.lists (
    id         uuid        primary key default gen_random_uuid(),
    name       text        not null,
    name_lower text        not null,
    items      jsonb       not null default '[]'::jsonb,
    created_at timestamptz not null default timezone('utc'::text, now()),
    updated_at timestamptz not null default timezone('utc'::text, now())
);

-- Contrainte d'unicité sur le nom normalisé (recherche insensible à la casse)
create unique index if not exists lists_name_lower_unique
    on public.lists (name_lower);

-- Index de tri par date de modification
create index if not exists lists_updated_at_idx
    on public.lists (updated_at desc);

-- Row Level Security
alter table public.lists enable row level security;

drop policy if exists "Le backend a un accès total aux listes" on public.lists;
create policy "Le backend a un accès total aux listes"
    on public.lists
    for all
    to service_role
    using (true)
    with check (true);
