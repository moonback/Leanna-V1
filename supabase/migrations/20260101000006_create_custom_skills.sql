-- ═══════════════════════════════════════════════════════════════════════════
-- Migration : création de la table custom_skills
-- ═══════════════════════════════════════════════════════════════════════════
-- Skills IA personnalisés créés par l'utilisateur via l'interface.
-- Idempotente (IF NOT EXISTS / OR REPLACE).
--
-- Note : le schéma d'origine (custom_skills_schema.sql) utilisait auth.role()
-- dans la politique RLS. On normalise ici vers `to service_role` pour rester
-- cohérent avec toutes les autres tables du projet.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.custom_skills (
    id          uuid        primary key default gen_random_uuid(),
    name        text        not null unique,
    description text        not null default '',
    parameters  jsonb       not null default '[]'::jsonb,
    instruction text        not null default '',
    category    text        not null default 'custom',
    enabled     boolean     not null default true,
    icon        text        default 'Sparkles',
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

-- Index partiel : chargement des skills actifs uniquement
create index if not exists idx_custom_skills_enabled
    on public.custom_skills (enabled)
    where enabled = true;

alter table public.custom_skills enable row level security;

drop policy if exists "service_role_full_access" on public.custom_skills;
create policy "service_role_full_access"
    on public.custom_skills
    for all
    to service_role
    using (true)
    with check (true);

-- Trigger auto-update updated_at
create or replace function public.update_custom_skills_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_custom_skills_updated_at on public.custom_skills;
create trigger trg_custom_skills_updated_at
    before update on public.custom_skills
    for each row
    execute function public.update_custom_skills_updated_at();
