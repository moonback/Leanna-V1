import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { FileText, RotateCcw, Copy, Check, Sparkles, AlertTriangle } from 'lucide-react';
import { useProfile } from '../../context/UserProfileContext.js';
import { Section, Field, SectionDivider } from './SettingsPrimitives.js';

// Modèles de départ insérables en un clic.
const TEMPLATES: { label: string; text: string }[] = [
  {
    label: 'Expert concis',
    text: 'Tu réponds de manière concise et directe, sans préambule. Tu vas droit au but et privilégies les exemples de code concrets.',
  },
  {
    label: 'Architecte SOLID',
    text: 'Tu es un expert en architecture logicielle. Tu privilégies les principes SOLID, les design patterns adaptés et la testabilité. Tu justifies brièvement tes choix.',
  },
  {
    label: 'Pédagogue',
    text: 'Tu expliques chaque concept clairement, étape par étape, comme à un développeur junior. Tu accompagnes tes réponses d\'analogies simples quand c\'est utile.',
  },
  {
    label: 'Revue stricte',
    text: 'Lors des revues de code, tu signales les problèmes de sécurité, de performance et de lisibilité. Tu proposes toujours une correction concrète.',
  },
];

// Seuil indicatif au-delà duquel on avertit (budget de tokens).
const SOFT_LIMIT = 4000;

export function SystemPromptSection() {
  const { profile, setField } = useProfile();
  const [copied, setCopied] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const text = profile.customSystemPrompt || '';
  const charCount = text.length;
  // Estimation grossière : ~4 caractères par token.
  const tokenEstimate = Math.ceil(charCount / 4);
  const overSoftLimit = charCount > SOFT_LIMIT;

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClear = () => {
    if (!confirmClear) { setConfirmClear(true); return; }
    setField('customSystemPrompt', '');
    setConfirmClear(false);
  };

  const insertTemplate = (tpl: string) => {
    const next = text.trim() ? `${text.trim()}\n\n${tpl}` : tpl;
    setField('customSystemPrompt', next);
  };

  return (
    <Section
      icon={FileText}
      title="Prompt Système"
      description="Personnalisez les instructions système de votre assistant"
    >
      <Field
        label="Instructions personnalisées"
        hint="Ce texte sera ajouté au prompt système de base. Utilisez-le pour définir le comportement, le ton, ou les connaissances spécifiques de l'assistant."
      >
        <div className="flex flex-col gap-2">
          {/* Modèles rapides */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-dimmed)' }}>
              <Sparkles className="h-3 w-3" /> Modèles :
            </span>
            {TEMPLATES.map(t => (
              <motion.button
                key={t.label}
                type="button"
                whileTap={{ scale: 0.95 }}
                onClick={() => insertTemplate(t.text)}
                title={t.text}
                className="rounded-full border px-2.5 py-1 text-xs font-medium transition-colors hover:opacity-80"
                style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-muted)' }}
              >
                {t.label}
              </motion.button>
            ))}
          </div>

          <div className="relative">
            <textarea
              value={profile.customSystemPrompt || ''}
              onChange={e => setField('customSystemPrompt', e.target.value)}
              placeholder="Ex : Tu es un expert en architecture logicielle. Tu privilégies toujours les design patterns SOLID. Tu réponds avec des exemples de code concrets..."
              rows={10}
              className="w-full rounded-xl px-3 py-2.5 text-xs font-mono outline-none transition-all duration-150 resize-y min-h-[160px]"
              style={{
                backgroundColor: 'var(--bg-input)',
                border: '1px solid var(--border-base)',
                color: 'var(--text-primary)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.02)',
                lineHeight: '1.6',
              }}
              onFocus={e => {
                e.currentTarget.style.borderColor = 'var(--accent-primary)';
                e.currentTarget.style.boxShadow = '0 0 0 3px var(--accent-subtle)';
                e.currentTarget.style.backgroundColor = 'var(--bg-base)';
              }}
              onBlur={e => {
                e.currentTarget.style.borderColor = 'var(--border-base)';
                e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(255,255,255,0.02)';
                e.currentTarget.style.backgroundColor = 'var(--bg-input)';
              }}
            />
          </div>

          {/* Actions bar */}
          <div className="flex items-center justify-between gap-2">
            <span
              className="flex items-center gap-1.5 text-xs font-mono"
              style={{ color: overSoftLimit ? 'var(--color-warning)' : charCount > 0 ? 'var(--text-muted)' : 'var(--text-dimmed)' }}
            >
              {overSoftLimit && <AlertTriangle className="h-3 w-3" />}
              {charCount} car. · ~{tokenEstimate} tokens
            </span>

            <div className="flex items-center gap-1.5">
              <motion.button
                type="button"
                onClick={handleCopy}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                disabled={!charCount}
                className="flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-medium transition-all disabled:opacity-30"
                style={{
                  borderColor: 'var(--border-base)',
                  color: 'var(--text-secondary)',
                  backgroundColor: 'var(--bg-secondary)',
                }}
              >
                {copied ? <Check className="h-3 w-3" style={{ color: 'var(--color-success)' }} /> : <Copy className="h-3 w-3" />}
                {copied ? 'Copié' : 'Copier'}
              </motion.button>

              <motion.button
                type="button"
                onClick={handleClear}
                onBlur={() => setConfirmClear(false)}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                disabled={!charCount}
                className="flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-medium transition-all disabled:opacity-30"
                style={{
                  borderColor: confirmClear ? 'var(--color-error)' : 'var(--border-base)',
                  color: confirmClear ? 'var(--color-error)' : 'var(--text-secondary)',
                  backgroundColor: confirmClear ? 'color-mix(in srgb, var(--color-error) 10%, transparent)' : 'var(--bg-secondary)',
                }}
              >
                <RotateCcw className="h-3 w-3" />
                {confirmClear ? 'Confirmer ?' : 'Effacer'}
              </motion.button>
            </div>
          </div>

          <AnimatePresence>
            {overSoftLimit && (
              <motion.p
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="text-xs"
                style={{ color: 'var(--color-warning)' }}
              >
                Prompt volumineux ({'>'}{SOFT_LIMIT} caractères) : il consomme une part notable du budget de tokens à chaque requête.
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </Field>

      <SectionDivider label="Informations" />

      <div
        className="rounded-xl border p-3"
        style={{
          backgroundColor: 'color-mix(in srgb, var(--accent-primary) 4%, var(--bg-secondary))',
          borderColor: 'var(--border-base)',
        }}
      >
        <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          💡 Le prompt personnalisé est <strong>ajouté</strong> aux instructions de base de l'assistant.
          Il ne remplace pas le comportement par défaut mais le complète.
          Utilisez-le pour spécialiser l'IA sur un domaine, ajuster son ton, ou lui donner des consignes spécifiques à votre projet.
        </p>
      </div>
    </Section>
  );
}
