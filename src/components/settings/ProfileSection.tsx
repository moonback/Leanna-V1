import { useMemo } from 'react';
import { motion } from 'motion/react';
import { User, AtSign, Briefcase, Sparkles } from 'lucide-react';
import { useProfile } from '../../context/UserProfileContext.js';
import { Section, Field, TextInput } from './SettingsPrimitives.js';

// Rôles proposés en accès rapide (restent entièrement éditables à la main).
const QUICK_ROLES = [
  'Développeur full-stack',
  'Développeur front-end',
  'Développeur back-end',
  'Data scientist',
  'DevOps',
  'Designer UI/UX',
  'Product manager',
  'Étudiant',
];

const NAME_MAX = 40;
const ROLE_MAX = 60;

/** Dérive les initiales affichées dans le badge d'avatar. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function ProfileSection() {
  const { profile, setField } = useProfile();

  const greeting = useMemo(() => {
    const ai = profile.aiName?.trim() || 'L\'IA';
    const you = profile.userName?.trim();
    const role = profile.userRole?.trim();
    if (!you) return `${ai} vous saluera dès que vous aurez renseigné votre prénom.`;
    return role
      ? `« Bonjour ${you} ! En tant que ${role.toLowerCase()}, sur quoi travaillons-nous aujourd'hui ? » — ${ai}`
      : `« Bonjour ${you} ! Ravi de vous retrouver. » — ${ai}`;
  }, [profile.aiName, profile.userName, profile.userRole]);

  const nameLen = profile.userName?.length ?? 0;
  const roleLen = profile.userRole?.length ?? 0;

  return (
    <Section
      icon={User}
      title="Qui êtes-vous ?"
      description="Les informations qui personnalisent vos échanges avec l'IA."
    >
      {/* Carte d'aperçu : avatar + aperçu de salutation */}
      <div
        className="flex items-center gap-3 rounded-xl border p-3"
        style={{
          borderColor: 'var(--border-base)',
          backgroundColor: 'color-mix(in srgb, var(--accent-primary) 6%, transparent)',
        }}
      >
        <motion.div
          key={initials(profile.userName)}
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
          style={{
            background: 'linear-gradient(135deg, var(--accent-primary), color-mix(in srgb, var(--accent-primary) 55%, #000))',
            boxShadow: '0 4px 14px color-mix(in srgb, var(--accent-primary) 30%, transparent)',
          }}
          aria-hidden
        >
          {initials(profile.userName)}
        </motion.div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-3 w-3 shrink-0" style={{ color: 'var(--accent-primary)' }} />
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-dimmed)' }}>
              Aperçu
            </span>
          </div>
          <p className="mt-0.5 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {greeting}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <Field
          label="Votre prénom"
          hint="L'IA vous appellera par ce prénom dans chaque conversation."
        >
          <div className="relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2">
              <AtSign className="h-3.5 w-3.5" style={{ color: 'var(--text-dimmed)' }} />
            </div>
            <TextInput
              value={profile.userName}
              onChange={v => setField('userName', v.slice(0, NAME_MAX))}
              placeholder="Ex : Mayss"
              style={{ paddingLeft: '2rem' }}
              maxLength={NAME_MAX}
            />
            {nameLen > 0 && (
              <span
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono"
                style={{ color: nameLen >= NAME_MAX ? 'var(--color-warning)' : 'var(--text-dimmed)' }}
              >
                {nameLen}/{NAME_MAX}
              </span>
            )}
          </div>
        </Field>

        <Field
          label="Votre rôle"
          hint="Fournit le contexte professionnel à l'IA pour des réponses mieux adaptées."
        >
          <div className="flex flex-col gap-2">
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2">
                <Briefcase className="h-3.5 w-3.5" style={{ color: 'var(--text-dimmed)' }} />
              </div>
              <TextInput
                value={profile.userRole}
                onChange={v => setField('userRole', v.slice(0, ROLE_MAX))}
                placeholder="Ex : développeur full-stack"
                style={{ paddingLeft: '2rem' }}
                maxLength={ROLE_MAX}
              />
              {roleLen > 0 && (
                <span
                  className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono"
                  style={{ color: roleLen >= ROLE_MAX ? 'var(--color-warning)' : 'var(--text-dimmed)' }}
                >
                  {roleLen}/{ROLE_MAX}
                </span>
              )}
            </div>

            {/* Accès rapide aux rôles courants */}
            <div className="flex flex-wrap gap-1.5">
              {QUICK_ROLES.map(role => {
                const isActive = profile.userRole.trim().toLowerCase() === role.toLowerCase();
                return (
                  <motion.button
                    key={role}
                    type="button"
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setField('userRole', isActive ? '' : role)}
                    className="rounded-full border px-2.5 py-1 text-xs font-medium transition-colors"
                    style={{
                      borderColor: isActive ? 'var(--accent-primary)' : 'var(--border-base)',
                      backgroundColor: isActive ? 'var(--accent-subtle)' : 'var(--bg-secondary)',
                      color: isActive ? 'var(--accent-primary)' : 'var(--text-muted)',
                    }}
                  >
                    {role}
                  </motion.button>
                );
              })}
            </div>
          </div>
        </Field>
      </div>
    </Section>
  );
}
