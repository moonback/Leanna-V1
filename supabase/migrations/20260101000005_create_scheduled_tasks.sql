-- ═══════════════════════════════════════════════════════════════════════════
-- Migration : création de la table scheduled_tasks
-- ═══════════════════════════════════════════════════════════════════════════
-- Tâches d'automatisation périodiques (exécution d'un skill à intervalle
-- régulier). Idempotente (IF NOT EXISTS).
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.scheduled_tasks (
    id                  uuid        primary key default gen_random_uuid(),
    name                text        not null,
    description         text,
    action_name         text        not null,
    args                jsonb       not null default '{}'::jsonb,
    interval_expression text        not null,  -- ex: "24h", "10m"
    enabled             boolean     default true,
    last_run_at         timestamptz,
    created_at          timestamptz not null default timezone('utc'::text, now())
);

alter table public.scheduled_tasks enable row level security;

drop policy if exists "Le backend a un accès total aux tâches planifiées" on public.scheduled_tasks;
create policy "Le backend a un accès total aux tâches planifiées"
    on public.scheduled_tasks
    for all
    to service_role
    using (true)
    with check (true);
