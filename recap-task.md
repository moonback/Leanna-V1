Récapitulatif complet — tout ce qui a été livré
1. Navigation web (plan PLAN_ACTION.md)
Historique + autocomplétion : useBrowserHistory.ts (persistance localStorage), suggestions classées par pertinence dans la barre d'adresse, navigation clavier, effacement.
Indicateurs de sécurité : HTTPS/HTTP distingués avec libellés accessibles.
Profils multiples : useBrowserProfiles.ts + BrowserProfileSwitcher.tsx — sessions Electron isolées (cookies/cache/stockage) via partitions, création/renommage/suppression.
Extensions Chromium : useBrowserExtensions.ts + BrowserExtensionsMenu.tsx + handlers IPC main/preload — chargement d'extensions décompressées par profil, persistées.
README mis à jour (section « Navigateur intégré » + TOC).
2. Sécurité & bugs (task.md §1-2)
Durcissement Electron : will-attach-webview (nodeIntegration off, contextIsolation, sandbox, partition validée), permissions refusées (caméra/micro/géoloc/notifs…), téléchargements bloqués, certificate-error fail-closed, setWindowOpenHandler deny.
open-external : allowlist http/https/mailto.
Renderer : openExternal via preload (plus de require('electron')), bouton stop pendant chargement, did-fail-load filtré par isMainFrame, fin du double-comptage d'historique, allowpopups retiré.
classifyHost réécrit (SSRF) : net.isIP, formes IPv6/mapped bloquées, fedex.com/feedly.com ne sont plus faux-positifs.
isSponsoredLink à bornes de mots (plus de faux positifs pubmed/service-public).
Anti-injection appliqué au contenu de page et aux sources de recherche.
Tests : 10 nouveaux (classifyHost, isSponsoredLink).
3. Recherche serveur (task.md §3)
webSearchProvider.ts : recherche DuckDuckGo HTML (vrais liens via décodage uddg), lecture de pages en parallèle côté serveur (fetch + extraction mode lecture), SSRF-safe, fetch injectable.
Outil browser_web_search : recherche + lecture parallèle sans détourner la webview. 11 tests unitaires hors réseau.
4. Débogage visuel (task.md §5.1-5.2)
browser_get_console : tampon console + erreurs réseau de la page, exposé à l'agent.
browser_capture : capture de la webview (capturePage) → analyse multimodale réelle via Gemini (inlineData), corrigeant l'ancienne implémentation cassée.
5. Onglets (task.md §4)
Décrits ci-dessus.
Bilan : les 5 sections prioritaires de task.md sont couvertes. Le navigateur intégré est passé de ~24 à 28 outils agent, avec sécurité durcie, recherche serveur robuste, débogage console/vision, et multi-onglets. Vérification systématique par typecheck + lint + tests unitaires (node:test), tout au vert ; seule limite constante : pas de test Electron de bout en bout faute d'environnement graphique.