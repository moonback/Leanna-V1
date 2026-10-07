import { Languages } from 'lucide-react';
import { useProfile } from '../../context/UserProfileContext.js';
import { Section, SectionDivider, Field, ChipGroup, ToggleSwitch, TextInput } from './SettingsPrimitives.js';
import { LANGUAGES, RESPONSE_STYLES } from './constants.js';

export function BehaviorSection() {
  const { profile, setField } = useProfile();

  return (
    <Section icon={Languages} title="Comportement" description="Adaptez les réponses à votre façon de travailler">
      <div className="flex flex-col gap-4">
        <Field label="Langue de réponse">
          <ChipGroup options={LANGUAGES} value={profile.language} onChange={v => setField('language', v)} />
        </Field>
        <Field label="Style de réponse">
          <ChipGroup options={RESPONSE_STYLES} value={profile.responseStyle} onChange={v => setField('responseStyle', v)} />
        </Field>

        <SectionDivider label="Raisonnement" />

        <Field label="Raisonnement structuré" hint="Chain of Thought, Tree of Thought, décomposition… Désactivez pour des réponses plus directes et rapides">
          <ToggleSwitch
            value={profile.reasoningEnabled}
            onChange={v => setField('reasoningEnabled', v)}
            label="Raisonnement"
            hint={profile.reasoningEnabled ? 'L\'IA peut réfléchir étape par étape avant de répondre' : 'Raisonnement désactivé — réponses directes uniquement'}
          />
        </Field>

        <SectionDivider label="Présence vocale" />

        <Field
          label="Présence vocale continue"
          hint="Ouvre la session vocale au démarrage et la rétablit automatiquement si elle se ferme. Leanna reste à l'écoute et peut parler d'elle-même."
        >
          <ToggleSwitch
            value={profile.voiceAlwaysOn}
            onChange={v => setField('voiceAlwaysOn', v)}
            label="Toujours active"
            hint={profile.voiceAlwaysOn ? 'La session vocale se connecte et se maintient seule' : 'Connexion vocale manuelle'}
          />
        </Field>

        <SectionDivider label="Mode Muet Automatique" />
       
        <Field label="Activer le mode muet automatique" hint="Coupe le micro automatiquement après une période d'inactivité">
          <ToggleSwitch
            value={profile.autoMuteEnabled}
            onChange={v => setField('autoMuteEnabled', v)}
            label="Mode muet auto"
            hint={profile.autoMuteEnabled ? `Micro coupé après ${profile.autoMuteTimeout}s d'inactivité` : 'Désactivé'}
          />
        </Field>
       
        <Field label="Délai avant muet (secondes)" hint="Temps d'inactivité avant de couper le micro (5–300s)">
          <TextInput
            value={String(profile.autoMuteTimeout)}
            onChange={v => setField('autoMuteTimeout', Math.min(300, Math.max(5, parseInt(v) || 40)))}
            placeholder="40"
            type="number"
            min="5"
            max="300"
            style={{ width: '80px' }}
          />
        </Field>

        <SectionDivider label="Détecteur d'Activité Vocale (VAD)" />

        <Field label="Activer la détection de voix" hint="Économise la bande passante en ne transmettant que la voix">
          <ToggleSwitch
            value={profile.vadEnabled}
            onChange={v => setField('vadEnabled', v)}
            label="VAD"
            hint={profile.vadEnabled ? 'Transmet uniquement pendant la parole' : 'Transmet en continu'}
          />
        </Field>

        <Field label="Seuil d'activation de la voix (0-100)" hint="Sensibilité minimale pour détecter la voix humaine">
          <TextInput
            value={String(profile.vadThreshold)}
            onChange={v => setField('vadThreshold', Math.min(100, Math.max(0, parseInt(v) || 35)))}
            placeholder="35"
            type="number"
            min="0"
            max="100"
            style={{ width: '80px' }}
          />
        </Field>

        <Field label="Durée de silence avant coupure (ms)" hint="Temps de silence avant d'arrêter la transmission (300-2000ms)">
          <TextInput
            value={String(profile.vadSilenceDuration)}
            onChange={v => setField('vadSilenceDuration', Math.min(2000, Math.max(300, parseInt(v) || 800)))}
            placeholder="800"
            type="number"
            min="300"
            max="2000"
            style={{ width: '80px' }}
          />
        </Field>
        <SectionDivider label="Interface de Chat" />

        <Field label="Suggestions rapides" hint="Affiche des chips de raccourcis (Expliquer ce fichier, Écrire des tests…) au-dessus du champ de saisie quand il est vide">
          <ToggleSwitch
            value={profile.showChatSuggestions}
            onChange={v => setField('showChatSuggestions', v)}
            label="Suggestions rapides"
            hint={profile.showChatSuggestions ? 'Les suggestions s\'affichent quand le chat est vide' : 'Suggestions masquées'}
          />
        </Field>
      </div>
    </Section>
  );
}