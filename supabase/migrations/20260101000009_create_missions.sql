-- ═══════════════════════════════════════════════════════════════════════════
-- Migration : création de la table missions
-- ═══════════════════════════════════════════════════════════════════════════
-- Persistance et reprise des missions autonomes. Stocke l'état complet de
-- chaque mission (Goal Stack, contexte, métriques) via MissionStore.
-- Au démarrage, l'Executor recharge les missions 'pending' / 'in_progress'
-- via resumePending().
-- Idempotente (IF NOT EXISTS).
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.missions (
    id         uuid        primary key,
    title      text        not null,
    status     text        not null,   -- pending | in_progress | completed | failed | blocked | cancelled
    priority   text        not null,   -- low | medium | high | critical
    state      jsonb       not null,   -- MissionState sérialisé (mission.toJSON())
    created_at timestamptz not null default timezone('utc'::text, now()),
    updated_at timestamptz not null default timezone('utc'::text, now())
);

-- Index pour la reprise et le listing
create index if not exists missions_status_idx
    on public.missions (status);

create index if not exists missions_updated_at_idx
    on public.missions (updated_at desc);

-- Row Level Security
alter table public.missions enable row level security;

drop policy if exists "Le backend a un accès total à missions" on public.missions;
create policy "Le backend a un accès total à missions"
    on public.missions
    for all
    to service_role
    using (true)
    with check (true);
