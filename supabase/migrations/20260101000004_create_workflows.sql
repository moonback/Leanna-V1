-- ═══════════════════════════════════════════════════════════════════════════
-- Migration : création de la table workflows
-- ═══════════════════════════════════════════════════════════════════════════
-- Pipelines d'actions chainées, optionnellement planifiées.
-- Idempotente (IF NOT EXISTS).
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.workflows (
    id              uuid        primary key default gen_random_uuid(),
    name            text        not null,
    description     text        not null default '',
    steps           jsonb       not null default '[]'::jsonb,
    schedule        text,        -- expression d'intervalle (ex: "24h", "30m"), null = non planifié
    enabled         boolean     default true,
    last_run_at     timestamptz,
    last_run_status text,        -- 'success' | 'partial' | 'failed'
    created_at      timestamptz not null default timezone('utc'::text, now())
);

-- Index partiel : filtrage rapide des workflows actifs planifiés
create index if not exists idx_workflows_enabled_schedule
    on public.workflows (enabled)
    where schedule is not null;

alter table public.workflows enable row level security;

drop policy if exists "Le backend a un accès total aux workflows" on public.workflows;
create policy "Le backend a un accès total aux workflows"
    on public.workflows
    for all
    to service_role
    using (true)
    with check (true);
