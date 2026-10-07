/**
 * Métadonnées des clés .env principales proposées par l'assistant de première
 * configuration (EnvSetupModal). Séparé du composant pour garder ce dernier
 * concis et faciliter l'évolution de la liste des clés.
 */

export interface KeySpec {
  key: string;
  label: string;
  hint: string;
  placeholder: string;
  /** true = bloque le bouton « Terminer » tant que vide (si pas déjà renseignée). */
  required?: boolean;
  /** true = champ secret masqué (œil). */
  secret?: boolean;
}

export const KEY_GROUPS: { title: string; keys: KeySpec[] }[] = [
  {
    title: 'Intelligence artificielle',
    keys: [
      {
        key: 'GEMINI_API_KEY',
        label: 'Clé API Gemini',
        hint: 'Requise pour les modèles Google Gemini. Obtenez-la sur aistudio.google.com/apikey (format AIza…).',
        placeholder: 'AIza…',
        required: true,
        secret: true,
      },
      {
        key: 'OPENROUTER_API_KEY',
        label: 'Clé API OpenRouter',
        hint: 'Optionnelle — fournisseur de secours et analyse de code (format sk-or-v1-…).',
        placeholder: 'sk-or-v1-…',
        secret: true,
      },
    ],
  },
  {
    title: 'Sécurité & accès',
    keys: [
      {
        key: 'Leanna_API_TOKEN',
        label: "Token d'API Leanna",
        hint: "Protège l'accès à l'API et aux WebSockets. Laissez vide pour en générer un automatiquement au démarrage.",
        placeholder: 'Généré automatiquement si vide',
        secret: true,
      },
    ],
  },
  {
    title: 'Base de données Supabase (optionnel)',
    keys: [
      {
        key: 'SUPABASE_URL',
        label: 'URL Supabase',
        hint: 'URL du projet Supabase (persistance missions / mémoires).',
        placeholder: 'https://xxxx.supabase.co',
        secret: false,
      },
      {
        key: 'SUPABASE_SERVICE_ROLE_KEY',
        label: 'Clé service_role Supabase',
        hint: 'Clé serveur privée. Ne la partagez jamais et ne l’exposez pas au navigateur.',
        placeholder: 'eyJhbGci…',
        secret: true,
      },
    ],
  },
  {
    title: 'Intégrations',
    keys: [
      {
        key: 'TELEGRAM_BOT_TOKEN',
        label: 'Token du bot Telegram',
        hint: 'Optionnel — notifications et contrôle via Telegram (obtenu via @BotFather).',
        placeholder: '123456:ABC…',
        secret: true,
      },
    ],
  },
];

export const ALL_SPECS: KeySpec[] = KEY_GROUPS.flatMap(g => g.keys);
export const REQUIRED_KEYS: string[] = ALL_SPECS.filter(s => s.required).map(s => s.key);
