import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

// Smoke test : vérifie que le harnais Vitest + RTL + jsdom est opérationnel.
describe('harnais de test', () => {
  it('rend un composant React et le trouve dans le DOM', () => {
    render(<div>bonjour</div>);
    expect(screen.getByText('bonjour')).toBeInTheDocument();
  });
});
