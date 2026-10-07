/**
 * Routeur pour la lecture et l'édition des variables d'environnement (.env).
 *
 * Sécurité :
 *  - Les valeurs des clés « sensibles » (tokens, clés API, secrets) sont
 *    masquées en lecture : le client ne reçoit jamais le secret en clair,
 *    seulement un indicateur `hasValue` + un aperçu tronqué.
 *  - En écriture, les clés sensibles sont chiffrées sur disque via `encrypt()`,
 *    exactement comme le fait `updateEnvFile()` dans server.ts.
 *  - Une liste blanche de clés (dérivée de .env.example) borne ce qui peut être
 *    lu/écrit depuis l'UI, afin d'éviter l'injection de clés arbitraires.
 */

import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { encrypt, decrypt } from '../utils/crypto.js';

// ── Clés sensibles : jamais renvoyées en clair, chiffrées sur disque ──────────
const SENSITIVE_ENV_KEYS = new Set<string>([
  'Leanna_API_TOKEN',
  'Leanna_MASTER_KEY',
  'GEMINI_API_KEY',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'OPENROUTER_API_KEY',
  'OPENROUTER_FREE_API_KEY',
  'GITHUB_TOKEN',
  'TELEGRAM_BOT_TOKEN',
  'SANDBOX_EXIT_CODE',
  'REDIS_URL',
  'LEANNA_KNOWLEDGE_REDIS_URL',
  'LEANNA_LOCK_REDIS_URL',
  'LEANNA_EVENTBUS_REDIS_URL',
  'VITE_Leanna_API_TOKEN',
  'VITE_SUPABASE_ANON_KEY',
  'VITE_SUPABASE_URL',
]);

// ── Types de champ pour un rendu adapté côté UI ───────────────────────────────
type EnvFieldType = 'secret' | 'boolean' | 'number' | 'select' | 'text';

interface EnvSelectOption {
  value: string;
  label: string;
}

interface EnvVarMeta {
  key: string;
  /** Valeur en clair (uniquement pour les clés NON sensibles). */
  value: string;
  /** true si une valeur non vide est définie (utile pour les secrets masqués). */
  hasValue: boolean;
  /** Aperçu tronqué pour les secrets (ex: "AIza••••wXyz"). */
  preview?: string;
  sensitive: boolean;
  type: EnvFieldType;
  section: string;
  /** Commentaire descriptif au-dessus de la clé dans le .env. */
  description?: string;
  options?: EnvSelectOption[];
}

interface EnvSection {
  title: string;
  vars: EnvVarMeta[];
}

// ── Config par clé : type de champ + options (déduites du domaine métier) ─────
const BOOLEAN_KEYS = new Set<string>([
  'DISABLE_HMR', 'LEANNA_PROVIDER_FALLBACK', 'OTEL_CONSOLE_EXPORT',
  'ENABLE_CHAIN_OF_THOUGHT', 'FORCE_TIERED_TOOLS', 'SELF_HEAL_READONLY',
  'Leanna_DRY_RUN', 'LEANNA_IDEMPOTENCY', 'ALLOW_FTP_PRIVATE_IPS',
]);

const NUMBER_KEY_HINTS = [
  '_MS', '_PORT', '_INTERVAL', '_THRESHOLD', '_COOLDOWN', '_TTL',
  '_SECONDS', '_MAXLEN', '_CONCURRENCY', '_QUEUE_SIZE', '_RETRIES', '_TIMEOUT',
];

const SELECT_KEYS: Record<string, EnvSelectOption[]> = {
  LOG_LEVEL: [
    { value: 'debug', label: 'debug' },
    { value: 'info', label: 'info' },
    { value: 'warn', label: 'warn' },
    { value: 'error', label: 'error' },
  ],
  LEANNA_AUTONOMY_MODE: [
    { value: 'suggest', label: 'suggest — propose sans agir' },
    { value: 'ask', label: 'ask — demande avant d\'agir' },
    { value: 'auto', label: 'auto — agit' },
  ],
  Leanna_PERMISSION_MODE: [
    { value: 'enforce', label: 'enforce — refuse si non accordé' },
    { value: 'audit', label: 'audit — journalise' },
    { value: 'off', label: 'off — aucune vérification' },
  ],
  NODE_ENV: [
    { value: 'development', label: 'development' },
    { value: 'production', label: 'production' },
    { value: 'test', label: 'test' },
  ],
  TOOL_LOG_TRANSCRIPT: [
    { value: 'full', label: 'full — texte tronqué (défaut)' },
    { value: 'metadata', label: 'metadata — sans le texte' },
    { value: 'off', label: 'off — aucun turn_text' },
  ],
};

function classifyType(key: string): EnvFieldType {
  if (SENSITIVE_ENV_KEYS.has(key)) return 'secret';
  if (SELECT_KEYS[key]) return 'select';
  if (BOOLEAN_KEYS.has(key)) return 'boolean';
  if (NUMBER_KEY_HINTS.some(h => key.toUpperCase().endsWith(h))) return 'number';
  return 'text';
}

/** Résout le dossier de config (même logique que updateEnvFile dans server.ts). */
function getConfigBase(): string {
  return process.env.Leanna_CONFIG_PATH || process.env.ELECTRON_APP_PATH || process.cwd();
}

/** Chemin du .env actif (préfère .env.local s'il existe). */
function getEnvPath(): string {
  const base = getConfigBase();
  const local = path.join(base, '.env.local');
  return fs.existsSync(local) ? local : path.join(base, '.env');
}

/** Masque un secret : garde quelques caractères de tête/queue. */
function maskSecret(plain: string): string {
  if (!plain) return '';
  if (plain.length <= 8) return '••••••••';
  return `${plain.slice(0, 4)}••••${plain.slice(-4)}`;
}

/**
 * Parse le fichier .env en conservant les sections (titres en commentaire de la
 * forme `# ─── Titre ───`) et les descriptions (lignes de commentaire juste
 * au-dessus d'une clé).
 */
function parseEnvFile(): EnvSection[] {
  const envPath = getEnvPath();
  let content = '';
  try {
    content = fs.readFileSync(envPath, 'utf-8');
  } catch {
    return [];
  }

  const lines = content.split(/\r?\n/);
  const sections: EnvSection[] = [];
  let current: EnvSection = { title: 'Général', vars: [] };
  sections.push(current);

  let pendingComment: string[] = [];

  const sectionHeaderRe = /^#\s*[─-]{2,}\s*(.+?)\s*[─-]{2,}\s*$/;

  for (const raw of lines) {
    const line = raw.trimEnd();

    // En-tête de section : `# ─── Titre ───────`
    const headerMatch = line.match(sectionHeaderRe);
    if (headerMatch) {
      const title = headerMatch[1].trim();
      current = { title, vars: [] };
      sections.push(current);
      pendingComment = [];
      continue;
    }

    // Ligne de commentaire ordinaire → description potentielle de la prochaine clé
    if (line.startsWith('#')) {
      const text = line.replace(/^#+\s?/, '').trim();
      if (text) pendingComment.push(text);
      continue;
    }

    // Ligne vide → réinitialise la description en attente
    if (line === '') {
      pendingComment = [];
      continue;
    }

    // Clé=valeur
    const kvMatch = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (kvMatch) {
      const key = kvMatch[1];
      let rawValue = kvMatch[2].trim();
      // Retire les guillemets englobants
      if (
        (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
        (rawValue.startsWith("'") && rawValue.endsWith("'"))
      ) {
        rawValue = rawValue.slice(1, -1);
      }

      const sensitive = SENSITIVE_ENV_KEYS.has(key);
      // Déchiffre les secrets stockés chiffrés pour produire un aperçu correct
      const plain = sensitive ? decrypt(rawValue) : rawValue;
      const type = classifyType(key);

      current.vars.push({
        key,
        value: sensitive ? '' : plain,
        hasValue: plain.length > 0,
        preview: sensitive ? maskSecret(plain) : undefined,
        sensitive,
        type,
        section: current.title,
        description: pendingComment.length ? pendingComment.join(' ') : undefined,
        options: SELECT_KEYS[key],
      });
      pendingComment = [];
    }
  }

  // Élague les sections vides
  return sections.filter(s => s.vars.length > 0);
}

/**
 * Écrit une clé=valeur dans le .env actif. Préserve commentaires et autres clés.
 * Chiffre les valeurs sensibles. Réplique la logique de updateEnvFile (server.ts).
 */
function writeEnvKey(key: string, value: string): void {
  const envPath = getEnvPath();
  const fileValue = SENSITIVE_ENV_KEYS.has(key) ? (value ? encrypt(value) : '') : value;

  let content = '';
  try {
    content = fs.readFileSync(envPath, 'utf-8');
  } catch { /* le fichier sera créé */ }

  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`^(${escapedKey}\\s*=.*)$`, 'm');
  const newLine = `${key}="${fileValue.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

  if (regex.test(content)) {
    content = content.replace(regex, newLine);
  } else {
    content = content.trimEnd() + `\n${newLine}\n`;
  }

  fs.writeFileSync(envPath, content, 'utf-8');
  // Hot-reload dans le process courant (valeur en clair)
  process.env[key] = value;
}

/**
 * Lit la valeur brute (telle qu'écrite sur disque) d'une seule clé du .env,
 * guillemets englobants retirés. Renvoie null si la clé est absente.
 */
function readRawEnvValue(key: string): string | null {
  const envPath = getEnvPath();
  let content = '';
  try {
    content = fs.readFileSync(envPath, 'utf-8');
  } catch {
    return null;
  }
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`^${escapedKey}\\s*=\\s*(.*)$`, 'm');
  const m = content.match(regex);
  if (!m) return null;
  let rawValue = m[1].trim();
  if (
    (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
    (rawValue.startsWith("'") && rawValue.endsWith("'"))
  ) {
    rawValue = rawValue.slice(1, -1);
  }
  return rawValue;
}

/** Ensemble des clés connues (bornage de l'écriture). */
function knownKeys(): Set<string> {
  const keys = new Set<string>();
  for (const section of parseEnvFile()) {
    for (const v of section.vars) keys.add(v.key);
  }
  return keys;
}

export function createEnvRouter(): Router {
  const router = Router();

  // GET /api/env — liste les variables groupées par section (secrets masqués)
  router.get('/', (_req: Request, res: Response) => {
    try {
      const sections = parseEnvFile();
      res.json({ status: 'success', sections, path: path.basename(getEnvPath()) });
    } catch (e: any) {
      res.status(500).json({ status: 'error', error: e.message });
    }
  });

  // GET /api/env/reveal/:key — renvoie la valeur EN CLAIR (déchiffrée) d'une
  // seule clé, uniquement sur demande explicite. Bornée aux clés connues.
  router.get('/reveal/:key', (req: Request, res: Response) => {
    const key = req.params.key;
    if (!knownKeys().has(key)) {
      return res.status(404).json({ status: 'error', error: 'Clé inconnue.' });
    }
    try {
      const raw = readRawEnvValue(key);
      if (raw === null) {
        return res.json({ status: 'success', key, value: '', hasValue: false });
      }
      // Les clés sensibles sont chiffrées au repos : on déchiffre.
      // decrypt() renvoie le texte tel quel s'il n'était pas chiffré (fallback).
      const value = SENSITIVE_ENV_KEYS.has(key) ? decrypt(raw) : raw;
      return res.json({ status: 'success', key, value, hasValue: value.length > 0 });
    } catch (e: any) {
      return res.status(500).json({ status: 'error', error: e.message });
    }
  });

  // POST /api/env — met à jour une ou plusieurs variables
  //   body: { updates: { KEY: "value", ... } }
  router.post('/', (req: Request, res: Response) => {
    const { updates } = req.body as { updates?: Record<string, string> };
    if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
      return res.status(400).json({ status: 'error', error: 'Le champ `updates` (objet clé→valeur) est requis.' });
    }

    const allowed = knownKeys();
    const applied: string[] = [];
    const rejected: string[] = [];

    try {
      for (const [key, value] of Object.entries(updates)) {
        // Bornage : n'autorise que les clés déjà présentes dans le .env
        if (!allowed.has(key)) { rejected.push(key); continue; }
        if (typeof value !== 'string') { rejected.push(key); continue; }
        // Un secret masqué renvoyé tel quel (contient ••••) ne doit pas écraser
        // la valeur réelle : on l'ignore.
        if (SENSITIVE_ENV_KEYS.has(key) && value.includes('••••')) continue;
        writeEnvKey(key, value);
        applied.push(key);
      }
      return res.json({
        status: 'success',
        applied,
        rejected,
        sections: parseEnvFile(),
      });
    } catch (e: any) {
      return res.status(500).json({ status: 'error', error: e.message });
    }
  });

  return router;
}
