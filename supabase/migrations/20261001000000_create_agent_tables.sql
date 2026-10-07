-- ═══════════════════════════════════════════════════════════════════════════
-- Migration : création des tables agent_orchestrations, agent_tasks,
--             agent_messages
-- ═══════════════════════════════════════════════════════════════════════════
-- Tables pour la persistance du système multi-agents. Extraites de
-- AgentPersistence.getMigrationSQL() (server/agents/AgentPersistence.ts).
-- L'endpoint GET /api/agents/persistence/migration retourne ce même SQL
-- pour information ; cette migration en est désormais la source de vérité.
--
-- Ordre de création : agent_orchestrations en premier car agent_tasks
-- référence son id via FK.
-- Idempotente (IF NOT EXISTS + ALTER TABLE idempotents).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Agent Orchestrations ───────────────────────────────────────────────

create table if not exists public.agent_orchestrations (
    id           uuid        primary key,
    title        text        not null,
    description  text        not null,
    status       text        not null default 'pending'
                             check (status in ('pending','running','completed','incomplete','failed','cancelled')),
    dependencies jsonb       not null default '{}',
    created_at   timestamptz not null default now(),
    completed_at timestamptz
);

-- Correction idempotente : garantit que 'incomplete' est dans la contrainte
-- pour les bases déjà créées avec l'ancienne version de la contrainte.
alter table public.agent_orchestrations
    drop constraint if exists agent_orchestrations_status_check;
alter table public.agent_orchestrations
    add constraint agent_orchestrations_status_check
    check (status in ('pending','running','completed','incomplete','failed','cancelled'));

create index if not exists idx_agent_orchestrations_status
    on public.agent_orchestrations (status);

create index if not exists idx_agent_orchestrations_created_at
    on public.agent_orchestrations (created_at desc);

-- ── 2. Agent Tasks ────────────────────────────────────────────────────────

create table if not exists public.agent_tasks (
    id                   uuid        primary key,
    orchestration_id     uuid        references public.agent_orchestrations(id) on delete set null,
    -- 'role' est un TEXT libre (sans CHECK) : les rôles sont ouverts.
    -- Le DynamicPlanner et l'Agent Builder peuvent enregistrer des rôles
    -- dynamiques. La validation se fait côté application (normalizeAgentRole
    -- + schémas Zod), pas via une liste figée en base.
    role                 text        not null,
    title                text        not null,
    description          text        not null,
    priority             text        not null default 'medium'
                                     check (priority in ('low','medium','high','critical')),
    status               text        not null default 'pending'
                                     check (status in ('pending','running','completed','incomplete','failed','cancelled')),
    context_files        text[]      not null default '{}',
    context_instructions text,
    context_metadata     jsonb,
    result               jsonb,
    created_at           timestamptz not null default now(),
    started_at           timestamptz,
    completed_at         timestamptz,
    timeout_ms           integer
);

-- Correction idempotente : supprime l'ancienne contrainte de rôle qui rejetait
-- 'researcher', 'debugger', 'tester', etc.
alter table public.agent_tasks
    drop constraint if exists agent_tasks_role_check;

-- Correction idempotente : garantit que 'incomplete' est dans la contrainte
-- de statut pour les bases déjà créées.
alter table public.agent_tasks
    drop constraint if exists agent_tasks_status_check;
alter table public.agent_tasks
    add constraint agent_tasks_status_check
    check (status in ('pending','running','completed','incomplete','failed','cancelled'));

create index if not exists idx_agent_tasks_status
    on public.agent_tasks (status);

create index if not exists idx_agent_tasks_role
    on public.agent_tasks (role);

create index if not exists idx_agent_tasks_created_at
    on public.agent_tasks (created_at desc);

create index if not exists idx_agent_tasks_orchestration
    on public.agent_tasks (orchestration_id);

-- ── 3. Agent Messages (bus inter-agents) ─────────────────────────────────

create table if not exists public.agent_messages (
    id             uuid        primary key,
    type           text        not null,
    from_role      text        not null,
    to_role        text        not null,
    priority       text        not null default 'medium',
    payload        jsonb       not null default '{}',
    correlation_id uuid,
    metadata       jsonb,
    created_at     timestamptz not null default now()
);

create index if not exists idx_agent_messages_type
    on public.agent_messages (type);

create index if not exists idx_agent_messages_from_role
    on public.agent_messages (from_role);

create index if not exists idx_agent_messages_created_at
    on public.agent_messages (created_at desc);

-- ── RLS (optionnel — activer si déploiement multi-tenant) ─────────────────
-- alter table public.agent_orchestrations enable row level security;
-- alter table public.agent_tasks          enable row level security;
-- alter table public.agent_messages       enable row level security;
