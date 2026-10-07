-- ═══════════════════════════════════════════════════════════════════════════
-- Migration : activation des extensions PostgreSQL
-- ═══════════════════════════════════════════════════════════════════════════
-- Doit être exécutée en premier : les extensions sont requises par les tables
-- suivantes (vector pour les embeddings, pg_trgm pour la recherche textuelle).
-- Idempotente (IF NOT EXISTS).
-- ═══════════════════════════════════════════════════════════════════════════

-- pgvector : recherche par similarité vectorielle (dimension 768, Google GenAI)
create extension if not exists vector;

-- pg_trgm : recherche textuelle par trigrammes (index GIN gin_trgm_ops)
create extension if not exists pg_trgm;
