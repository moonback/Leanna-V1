import { useCallback, useState } from 'react';
import { motion } from 'motion/react';
import { Cpu, Volume2, Wand2, Play } from 'lucide-react';
import { useProfile } from '../../context/UserProfileContext.js';
import { Section, Field, TextInput } from './SettingsPrimitives.js';
import { VOICES } from './constants.js';

export function AiSection() {
  const { profile, setField } = useProfile();
  const [previewing, setPreviewing] = useState<string | null>(null);

  const aiName = profile.aiName?.trim() || 'Leanna';

  // Aperçu audio via l'API SpeechSynthesis du navigateur (indépendant de Gemini Live).
  const supportsSpeech = typeof window !== 'undefined' && 'speechSynthesis' in window;

  const previewVoice = useCallback((voiceId: string, sample: string) => {
    if (!supportsSpeech) return;
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(`Bonjour, je suis ${aiName}. ${sample}`);
      utter.lang = profile.language === 'fr' ? 'fr-FR' : 'en-US';
      utter.onend = () => setPreviewing(null);
      utter.onerror = () => setPreviewing(null);
      setPreviewing(voiceId);
      window.speechSynthesis.speak(utter);
    } catch {
      setPreviewing(null);
    }
  }, [aiName, profile.language, supportsSpeech]);

  return (
    <Section
      icon={Cpu}
      title="Identité de l'IA"
      description="Personnalisez le nom et la voix de votre assistant"
    >
      <Field label="Nom de l'IA" hint="Comment l'assistant se présente dans chaque réponse.">
        <div className="relative">
          <div className="absolute left-3 top-1/2 -translate-y-1/2">
            <Wand2 className="h-3.5 w-3.5" style={{ color: 'var(--text-dimmed)' }} />
          </div>
          <TextInput
            value={profile.aiName}
            onChange={v => setField('aiName', v)}
            placeholder="Ex : Leanna"
            style={{ paddingLeft: '2rem' }}
          />
        </div>
      </Field>

      <Field
        label="Voix"
        hint={supportsSpeech
          ? 'Voix utilisée pour la synthèse vocale Gemini Live. Cliquez sur ▶ pour un aperçu audio local.'
          : 'Voix utilisée pour la synthèse vocale Gemini Live.'}
      >
        <div className="grid grid-cols-3 gap-2 pr-1 sm:grid-cols-5">
          {VOICES.map(v => {
            const isActive = profile.aiVoice === v.id;
            const isPlaying = previewing === v.id;
            return (
              <motion.div
                key={v.id}
                whileHover={{ y: -2 }}
                className="relative"
              >
                <button
                  type="button"
                  onClick={() => setField('aiVoice', v.id)}
                  className="flex w-full flex-col items-center gap-1 rounded-xl px-2 py-3 text-xs font-semibold transition-all duration-200"
                  style={{
                    backgroundColor: isActive ? 'var(--accent-subtle)' : 'var(--bg-secondary)',
                    border: `1.5px solid ${isActive ? 'var(--accent-primary)' : 'var(--border-base)'}`,
                    color: isActive ? 'var(--accent-primary)' : 'var(--text-muted)',
                    boxShadow: isActive ? '0 4px 12px color-mix(in srgb, var(--accent-primary) 20%, transparent)' : 'none',
                  }}
                  aria-pressed={isActive}
                >
                  <div
                    className="flex h-7 w-7 items-center justify-center rounded-full transition-all duration-200"
                    style={{ backgroundColor: isActive ? 'var(--accent-primary)' : 'var(--bg-panel)' }}
                  >
                    <Volume2 className="w-3.5 h-3.5" style={{ color: isActive ? 'white' : 'var(--accent-primary)' }} />
                  </div>
                  <span className="text-sm font-semibold">{v.label}</span>
                  <span className="text-xs font-normal text-center leading-tight opacity-70">{v.desc}</span>
                </button>
                {supportsSpeech && (
                  <button
                    type="button"
                    onClick={() => previewVoice(v.id, v.desc)}
                    title="Écouter un aperçu"
                    aria-label={`Écouter un aperçu de la voix ${v.label}`}
                    className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full transition-colors hover:bg-[var(--bg-hover)]"
                    style={{ color: 'var(--accent-primary)' }}
                  >
                    {isPlaying
                      ? <Volume2 className="h-3 w-3 animate-pulse" />
                      : <Play className="h-2.5 w-2.5" />}
                  </button>
                )}
              </motion.div>
            );
          })}
        </div>
      </Field>
    </Section>
  );
}
