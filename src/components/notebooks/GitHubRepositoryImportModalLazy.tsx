/**
 * GitHubRepositoryImportModalLazy — enveloppe `React.lazy` autour de
 * GitHubRepositoryImportModal (~1300 lignes, le plus gros composant du module).
 *
 * La modale n'est affichée que sur action explicite de l'utilisateur (bouton
 * « Importer depuis GitHub »). La charger paresseusement la sort du bundle
 * principal : son code — et ses dépendances propres — ne sont fetchés qu'au
 * premier affichage. Les deux appelants (NotebookList, SourcePanel) partagent
 * le même chunk via cet import() unique.
 *
 * Comme les call-sites montent déjà la modale conditionnellement
 * (`{showGitHubImport && <… />}`), le Suspense n'enveloppe que l'instance
 * ouverte ; `fallback={null}` suffit (la modale gère son propre scrim/anim).
 */

import { lazy, Suspense, type ComponentProps } from 'react';

const GitHubRepositoryImportModalInner = lazy(() =>
  import('./GitHubRepositoryImportModal.js').then((m) => ({
    default: m.GitHubRepositoryImportModal,
  })),
);

type Props = ComponentProps<typeof GitHubRepositoryImportModalInner>;

export function GitHubRepositoryImportModal(props: Props) {
  return (
    <Suspense fallback={null}>
      <GitHubRepositoryImportModalInner {...props} />
    </Suspense>
  );
}
