-- ═══════════════════════════════════════════════════════════════════════════
-- Migration : création de la table autonomy_tasks
-- ═══════════════════════════════════════════════════════════════════════════
-- Task store durable pour le travail autonome (TaskManager). Permet la reprise
-- des tâches au redémarrage : une tâche 'running' interrompue par un crash est
-- rechargée puis re-soumise comme 'pending' via AutonomyPersistence.
--
-- Les colonnes doivent rester alignées avec
-- AutonomyPersistence.getMigrationSQL() (server/autonomy/AutonomyPersistence.ts).
-- Idempotente (IF NOT EXISTS).
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.autonomy_tasks (
    id              uuid        primary key,
    type            text        not null check (type in ('maintenance','reactive','mission','reflection')),
    title           text        not null,
    priority        text        not null default 'medium' check (priority in ('low','medium','high','critical')),
    source_event_id text        not null,
    fingerprint     text        not null,
    status          text        not null default 'pending'
                                check (status in ('pending','running','completed','failed','dead_letter','cancelled')),
    attempts        integer     not null default 0,
    max_retries     integer     not null default 3,
    timeout_ms      integer     not null default 60000,
    metadata        jsonb,
    error           text,
    created_at      timestamptz not null default timezone('utc'::text, now()),
    updated_at      timestamptz not null default timezone('utc'::text, now())
);

-- Index pour la reprise (status), le filtrage (type) et le listing
create index if not exists idx_autonomy_tasks_status
    on public.autonomy_tasks (status);

create index if not exists idx_autonomy_tasks_type
    on public.autonomy_tasks (type);

create index if not exists idx_autonomy_tasks_created_at
    on public.autonomy_tasks (created_at desc);

-- Row Level Security
alter table public.autonomy_tasks enable row level security;

drop policy if exists "Le backend a un accès total à autonomy_tasks" on public.autonomy_tasks;
create policy "Le backend a un accès total à autonomy_tasks"
    on public.autonomy_tasks
    for all
    to service_role
    using (true)
    with check (true);
