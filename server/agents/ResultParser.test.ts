/**
 * Tests — ResultParser.detectFailure : canal structuré vs heuristique
 *
 * Le point faible historique : un agent qui déclare honnêtement "je n'ai pas
 * pu terminer" en prose n'était PAS détecté comme un échec (seul "Vérification :
 * FAIL" ou "## Échec" l'était). Le canal structuré (marqueur machine) rend la
 * détection déterministe, quelle que soit la tournure. On vérifie les deux
 * canaux et leur priorité.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { ResultParser } from "./ResultParser.js";

const parser = new ResultParser();

describe("detectFailure — canal structuré (déterministe)", () => {
  it("détecte un échec via le commentaire machine, sans dépendre de la prose", () => {
    const text =
      "## Résumé\nJ'ai exploré le code mais la dépendance manque.\n" +
      "<!-- leanna:outcome=failed reason=dépendance manquante lodash -->";
    const result = parser.detectFailure(text);
    assert.ok(result, "failed structuré doit être détecté");
    assert.match(result!, /dépendance manquante lodash/);
  });

  it("détecte un blocage via le commentaire machine", () => {
    const text = "Travail interrompu.\n<!-- leanna:outcome=blocked reason=build cassé en amont -->";
    const result = parser.detectFailure(text);
    assert.ok(result);
    assert.match(result!, /blocage|bloqué/i);
  });

  it("détecte un échec via la ligne de champ Statut: FAILED", () => {
    const text = "## Résumé\nRien n'a fonctionné.\nStatut: FAILED — compilation impossible";
    const result = parser.detectFailure(text);
    assert.ok(result);
    assert.match(result!, /compilation impossible/);
  });

  it("un statut structuré success NE déclenche PAS d'échec, même si le mot FAIL apparaît en prose", () => {
    const text =
      "## Détails\nLe test unitaire nommé shouldNotFail a été ajouté.\n" +
      "<!-- leanna:outcome=success -->";
    assert.equal(parser.detectFailure(text), null);
  });

  it("un statut structuré no_change n'est pas un échec", () => {
    const text = "Aucune modification nécessaire.\n<!-- leanna:outcome=no_change reason=déjà conforme -->";
    assert.equal(parser.detectFailure(text), null);
  });
});

describe("detectFailure — canal heuristique (repli, rétro-compatible)", () => {
  it("détecte toujours la vérification FAIL historique sans marqueur structuré", () => {
    const text = "## Preuves d'exécution\n- Vérification : FAIL\n";
    const result = parser.detectFailure(text);
    assert.ok(result);
    assert.match(result!, /vérification en échec/i);
  });

  it("détecte toujours un titre ## Échec", () => {
    const text = "## Échec\nImpossible de continuer.";
    assert.ok(parser.detectFailure(text));
  });

  it("un texte honnête incomplet sans marqueur n'est PAS un échec (comportement préservé)", () => {
    const text = "## Résumé\nAucune modification n'a pu être appliquée dans ce tour.";
    assert.equal(parser.detectFailure(text), null);
  });
});
