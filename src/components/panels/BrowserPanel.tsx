/**
 * BrowserPanel — Navigateur web intégré via Electron <webview>.
 * Contrôlable depuis l'extérieur (prop `url`) pour permettre à Leanna
 * de piloter la navigation. Émet des CustomEvents pour notifier le reste
 * de l'application des changements d'URL/titre/contenu.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { BrowserExternalOverlay } from './BrowserExternalOverlay.js';
import { BrowserToolbar } from './BrowserToolbar.js';
import { BrowserTabStrip } from './BrowserTabStrip.js';
import { BrowserFindBar } from './BrowserFindBar.js';
import { BrowserTabView } from './BrowserTabView.js';
import type { BrowserTabHandle, TabStatePatch } from './BrowserTabView.js';
import { useBrowserHistory } from './useBrowserHistory.js';
import { useBrowserProfiles } from './useBrowserProfiles.js';
import { useBrowserExtensions } from './useBrowserExtensions.js';
import type {
  BrowserPanelProps,
  WebviewElement,
} from './browserTypes.js';

/** Un onglet du navigateur : identité + état d'affichage dérivé de sa webview. */
interface BrowserTab {
  id: string;
  url: string;
  title: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  loadError: string | null;
  faviconUrl: string | null;
}

let tabCounter = 0;
function newTabId(): string {
  tabCounter += 1;
  return `tab-${Date.now().toString(36)}-${tabCounter}`;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export const BROWSER_HOME_URL = 'https://www.google.com/webhp?igu=1';

export function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return BROWSER_HOME_URL;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}/.test(trimmed) && !trimmed.includes(' ')) {
    return `https://${trimmed}`;
  }
  return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
}

// ─── Composant ───────────────────────────────────────────────────────────────

export function BrowserPanel({
  onClose,
  onOpenExternal,
  onOpenInNewTab,
  url: controlledUrl,
  defaultUrl = BROWSER_HOME_URL,
  fullWidth = false,
  width = '520px',
}: BrowserPanelProps) {
  const webviewRef = useRef<WebviewElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /** Historique de navigation persistant + suggestions d'autocomplétion */
  const { recordVisit, updateTitle, getSuggestions, clearHistory } = useBrowserHistory();

  /** Profils de navigation isolés (sessions/cookies/cache séparés) */
  const {
    profiles,
    activeProfile,
    createProfile,
    renameProfile,
    deleteProfile,
    switchProfile,
  } = useBrowserProfiles();
  /** Partition de session Electron du profil actif. */
  const partition = activeProfile.partition;

  /** Extensions Chromium chargées pour le profil (partition) actif. */
  const extensions = useBrowserExtensions(partition);

  // ── Onglets ─────────────────────────────────────────────────────────────────
  const [tabs, setTabs] = useState<BrowserTab[]>(() => [{
    id: newTabId(),
    url: defaultUrl,
    title: '',
    loading: false,
    canGoBack: false,
    canGoForward: false,
    loadError: null,
    faviconUrl: null,
  }]);
  const [activeTabId, setActiveTabId] = useState<string>(() => tabs[0].id);

  /** Handles impératifs par onglet (loadURL/reload/stop/goBack/getWebview/getConsole). */
  const tabHandlesRef = useRef<Map<string, BrowserTabHandle>>(new Map());
  /** Id de l'onglet actif, en ref (lisible depuis les closures d'événements). */
  const activeTabIdRef = useRef(activeTabId);
  useEffect(() => { activeTabIdRef.current = activeTabId; }, [activeTabId]);

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];

  // L'input de la barre d'adresse est édité librement : état séparé, resynchronisé
  // sur l'URL de l'onglet actif via l'effet ci-dessous.
  const [inputValue, setInputValue] = useState(activeTab.url);

  // État dérivé de l'onglet actif (pilote la barre d'outils).
  const currentUrl = activeTab.url;
  const loading = activeTab.loading;
  const canGoBack = activeTab.canGoBack;
  const canGoForward = activeTab.canGoForward;
  const pageTitle = activeTab.title;
  const loadError = activeTab.loadError;

  /** Indicateur visuel quand Leanna pilote la navigation */
  const [assistantNavActive, setAssistantNavActive] = useState(false);
  /** Indique si une fenêtre externe est ouverte */
  const [isExternalWindowOpen, setIsExternalWindowOpen] = useState(false);
  /** Référence à la fenêtre externe ouverte (pour vérifier closed) */
  const externalWindowRef = useRef<Window | null>(null);

  // Références stables vers les callbacks d'historique : l'onglet actif les
  // appelle lors des navigations/titres.
  const recordVisitRef = useRef(recordVisit);
  const updateTitleRef = useRef(updateTitle);
  useEffect(() => { recordVisitRef.current = recordVisit; }, [recordVisit]);
  useEffect(() => { updateTitleRef.current = updateTitle; }, [updateTitle]);

  // Resynchroniser la barre d'adresse quand on change d'onglet ou que l'onglet
  // actif change d'URL (navigation).
  useEffect(() => {
    setInputValue(activeTab.url);
  }, [activeTab.id, activeTab.url]);

  // ── Réception des patchs d'état d'onglet (depuis BrowserTabView) ────────────
  const handleTabState = useCallback((tabId: string, patch: TabStatePatch) => {
    setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, ...patch } : t)));
    // Historique : enregistrer la visite/titre pour les navigations réussies.
    if (patch.url) recordVisitRef.current(patch.url, patch.title ?? '');
    if (patch.title) updateTitleRef.current(patch.url ?? '', patch.title);
  }, []);

  const handleTabRegister = useCallback((tabId: string, handle: BrowserTabHandle | null) => {
    if (handle) tabHandlesRef.current.set(tabId, handle);
    else tabHandlesRef.current.delete(tabId);
  }, []);

  /** Branche la webview de l'onglet actif sur webviewRef (handlers inchangés). */
  const handleActiveWebview = useCallback((wv: WebviewElement | null) => {
    (webviewRef as React.MutableRefObject<WebviewElement | null>).current = wv;
  }, []);

  /** Handle de l'onglet actif (navigation interne). Lu via ref pour les closures. */
  const activeHandle = () => tabHandlesRef.current.get(activeTabIdRef.current) ?? null;

  // ── Navigation interne (sur l'onglet actif) ─────────────────────────────────

  const navigateTo = useCallback((raw: string) => {
    const url = normalizeUrl(raw);
    setInputValue(url);
    setTabs((prev) => prev.map((t) => (t.id === activeTabId ? { ...t, loadError: null } : t)));
    tabHandlesRef.current.get(activeTabId)?.loadURL(url);
  }, [activeTabId]);

  // ── Gestion des onglets ─────────────────────────────────────────────────────

  /** Ouvre un nouvel onglet (optionnellement en arrière-plan) et renvoie son id. */
  const openTab = useCallback((url: string = BROWSER_HOME_URL, activate = true): string => {
    const id = newTabId();
    const normalized = (() => { try { return normalizeUrl(url); } catch { return BROWSER_HOME_URL; } })();
    setTabs((prev) => [...prev, {
      id, url: normalized, title: '', loading: false, canGoBack: false, canGoForward: false, loadError: null, faviconUrl: null,
    }]);
    if (activate) setActiveTabId(id);
    return id;
  }, []);

  const switchTab = useCallback((id: string) => {
    setActiveTabId((prev) => (prev === id ? prev : id));
  }, []);

  /** Ferme un onglet ; si c'était le dernier, ferme le panneau. */
  const closeTab = useCallback((id: string) => {
    setTabs((prev) => {
      if (prev.length <= 1) {
        // Dernier onglet : fermer le navigateur entier.
        onClose();
        return prev;
      }
      const idx = prev.findIndex((t) => t.id === id);
      const next = prev.filter((t) => t.id !== id);
      // Si on ferme l'onglet actif, activer le voisin.
      setActiveTabId((cur) => {
        if (cur !== id) return cur;
        const neighbor = next[Math.max(0, idx - 1)] ?? next[0];
        return neighbor.id;
      });
      tabHandlesRef.current.delete(id);
      return next;
    });
  }, [onClose]);

  // Relai depuis le main (setWindowOpenHandler) : window.open / target=_blank →
  // ouvrir dans un nouvel onglet d'arrière-plan plutôt qu'une fenêtre non contrôlée.
  useEffect(() => {
    const onOpenUrl = (e: Event) => {
      const detail = (e as CustomEvent).detail as { url?: string } | undefined;
      if (detail?.url) openTab(detail.url, false);
    };
    window.addEventListener('Leanna-browser-open-url', onOpenUrl as EventListener);
    return () => window.removeEventListener('Leanna-browser-open-url', onOpenUrl as EventListener);
  }, [openTab]);

  // ── Navigation contrôlée depuis l'extérieur (Leanna) ───────────────────────

  useEffect(() => {
    if (!controlledUrl) return;
    const normalized = normalizeUrl(controlledUrl);
    if (normalized === currentUrl) return;
    setAssistantNavActive(true);
    navigateTo(normalized);
    const timer = setTimeout(() => setAssistantNavActive(false), 3000);
    return () => clearTimeout(timer);
  }, [controlledUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers clavier barre d'adresse ───────────────────────────────────────

  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        navigateTo(inputValue);
        inputRef.current?.blur();
      } else if (e.key === 'Escape') {
        setInputValue(currentUrl);
        inputRef.current?.blur();
      }
    },
    [inputValue, currentUrl, navigateTo],
  );

  /** Sélection d'une suggestion d'autocomplétion : navigue vers l'URL. */
  const handleSelectSuggestion = useCallback(
    (url: string) => {
      navigateTo(url);
      inputRef.current?.blur();
    },
    [navigateTo],
  );

  const handleGoBack = useCallback(() => webviewRef.current?.goBack(), []);
  const handleGoForward = useCallback(() => webviewRef.current?.goForward(), []);
  const handleRefresh = useCallback(() => {
    setTabs((prev) => prev.map((t) => (t.id === activeTabId ? { ...t, loadError: null } : t)));
    // Si un chargement est en cours, le bouton agit comme « Arrêter ».
    if (loading) {
      webviewRef.current?.stop();
    } else {
      webviewRef.current?.reload();
    }
  }, [loading, activeTabId]);
  const handleHome = useCallback(() => navigateTo(BROWSER_HOME_URL), [navigateTo]);

  // ── Zoom (sur l'onglet actif) ───────────────────────────────────────────────
  // Niveau de zoom Electron : 0 = 100 %, chaque pas ≈ +20 %. On borne [-3, +3].
  const [zoomLevel, setZoomLevel] = useState(0);
  const applyZoom = useCallback((level: number) => {
    const clamped = Math.max(-3, Math.min(3, level));
    setZoomLevel(clamped);
    webviewRef.current?.setZoomLevel(clamped);
  }, []);
  const handleZoomIn = useCallback(() => applyZoom(zoomLevel + 0.5), [applyZoom, zoomLevel]);
  const handleZoomOut = useCallback(() => applyZoom(zoomLevel - 0.5), [applyZoom, zoomLevel]);
  const handleZoomReset = useCallback(() => applyZoom(0), [applyZoom]);
  // Réappliquer le zoom courant quand on change d'onglet (chaque webview a son propre zoom).
  useEffect(() => {
    webviewRef.current?.setZoomLevel(zoomLevel);
  }, [activeTabId]); // eslint-disable-line react-hooks/exhaustive-deps
  /** Pourcentage affiché (approximation : 1,2^niveau). */
  const zoomPercent = Math.round(Math.pow(1.2, zoomLevel) * 100);

  // ── Recherche dans la page ──────────────────────────────────────────────────
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [findMatches, setFindMatches] = useState<{ active: number; total: number } | null>(null);

  const runFind = useCallback((text: string, forward = true, findNext = false) => {
    const wv = webviewRef.current;
    if (!wv) return;
    if (!text) {
      wv.stopFindInPage('clearSelection');
      setFindMatches(null);
      return;
    }
    wv.findInPage(text, { forward, findNext });
  }, []);

  const handleFindChange = useCallback((text: string) => {
    setFindQuery(text);
    runFind(text, true, false);
  }, [runFind]);

  const handleFindNext = useCallback(() => runFind(findQuery, true, true), [runFind, findQuery]);
  const handleFindPrev = useCallback(() => runFind(findQuery, false, true), [runFind, findQuery]);

  const closeFind = useCallback(() => {
    setFindOpen(false);
    setFindMatches(null);
    webviewRef.current?.stopFindInPage('clearSelection');
  }, []);

  const toggleFind = useCallback(() => {
    setFindOpen((v) => {
      if (v) { webviewRef.current?.stopFindInPage('clearSelection'); setFindMatches(null); }
      return !v;
    });
  }, []);

  // Écoute des résultats found-in-page sur la webview active.
  useEffect(() => {
    const wv = webviewRef.current;
    if (!wv) return;
    const onFound = (e: Event) => {
      const r = (e as import('./browserTypes.js').WebviewFoundInPageEvent).result;
      if (r) setFindMatches({ active: r.activeMatchOrdinal, total: r.matches });
    };
    wv.addEventListener('found-in-page', onFound);
    return () => wv.removeEventListener('found-in-page', onFound);
  }, [activeTabId]);

  // Ctrl/Cmd+F ouvre la recherche dans la page quand le navigateur est monté.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setFindOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ── DevTools (onglet actif) ─────────────────────────────────────────────────
  const handleToggleDevTools = useCallback(() => {
    const wv = webviewRef.current;
    if (!wv) return;
    if (wv.isDevToolsOpened()) wv.closeDevTools();
    else wv.openDevTools();
  }, []);
  // Référence pour l'intervalle de vérification de la fenêtre externe
  const externalWindowCheckRef = useRef<NodeJS.Timeout | null>(null);

  const handleOpenInNewWindow = useCallback(() => {
    // Ouvrir dans le navigateur par défaut du système via le pont preload
    // (validé + allowlist côté main). On n'utilise JAMAIS require('electron')
    // dans le renderer (nodeIntegration désactivé).
    const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
    if (api?.openExternal) {
      void api.openExternal(currentUrl);
      // On ne peut pas détecter la fermeture de la fenêtre externe : l'overlay
      // reste affiché jusqu'à ce que l'utilisateur clique sur « Fermer le message ».
      externalWindowRef.current = null;
      setIsExternalWindowOpen(true);
    } else {
      // Mode dev web (hors Electron) : repli sur window.open.
      const extWindow = window.open(currentUrl, '_blank', 'noopener,noreferrer');
      if (extWindow) {
        externalWindowRef.current = extWindow;
        setIsExternalWindowOpen(true);
        if (externalWindowCheckRef.current) {
          clearInterval(externalWindowCheckRef.current);
        }
        externalWindowCheckRef.current = setInterval(() => {
          if (extWindow.closed) {
            setIsExternalWindowOpen(false);
            externalWindowRef.current = null;
            if (externalWindowCheckRef.current) {
              clearInterval(externalWindowCheckRef.current);
              externalWindowCheckRef.current = null;
            }
          }
        }, 500);
      }
    }

    onOpenExternal?.();
  }, [currentUrl, onOpenExternal]);

  // Nettoyer l'intervalle quand le composant est démonté
  useEffect(() => {
    return () => {
      if (externalWindowCheckRef.current) {
        clearInterval(externalWindowCheckRef.current);
        externalWindowCheckRef.current = null;
      }
    };
  }, []);

  // ── Événements webview ──────────────────────────────────────────────────────
  // Chaque onglet (BrowserTabView) gère désormais ses propres événements natifs
  // (chargement/titre/url/console/échec) et remonte son état via handleTabState.
  // Le panneau n'a plus d'effet natif global ; webviewRef pointe sur la webview
  // de l'onglet actif (branchée par handleActiveWebview).

  // ── Écoute des commandes directes via CustomEvent (fallback / scroll) ───────

  useEffect(() => {
    const handleNav = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.url) return;
      setAssistantNavActive(true);
      navigateTo(detail.url);
      setTimeout(() => setAssistantNavActive(false), 3000);
    };

    // Ouvrir une URL dans un nouvel onglet (depuis browser_new_tab).
    const handleNewTab = (e: Event) => {
      const detail = (e as CustomEvent).detail as { url?: string; activate?: boolean };
      if (!detail?.url) return;
      openTab(detail.url, detail.activate !== false);
      setAssistantNavActive(true);
      setTimeout(() => setAssistantNavActive(false), 3000);
    };

    const handleScroll = (e: Event) => {
      const detail = (e as CustomEvent).detail as { direction: string; amount: number };
      const wv = webviewRef.current;
      if (!wv) return;

      let js = '';
      if (detail.direction === 'top') {
        js = 'window.scrollTo({ top: 0, behavior: "smooth" })';
      } else if (detail.direction === 'bottom') {
        js = 'window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" })';
      } else if (detail.direction === 'up') {
        js = `window.scrollBy({ top: -${detail.amount ?? 300}, behavior: "smooth" })`;
      } else {
        js = `window.scrollBy({ top: ${detail.amount ?? 300}, behavior: "smooth" })`;
      }
      wv.executeJavaScript(js).catch(() => {/* ignore */});
    };

    const handleBrowserControl = (e: Event) => {
      const detail = (e as CustomEvent).detail as { type: string };
      const wv = webviewRef.current;
      if (!wv) return;
      if (detail.type === 'browser-back') {
        wv.goBack();
      } else if (detail.type === 'browser-forward') {
        wv.goForward();
      } else if (detail.type === 'browser-reload') {
        wv.reload();
      }
    };

    // ── Canal retour : Leanna demande le contenu de la page ──────────────
    const handleReadRequest = async (e: Event) => {
      const detail = (e as CustomEvent).detail as { requestId: string; selector: string | null };
      const wv = webviewRef.current;
      if (!wv) return;

      const extractScript = detail.selector
        ? `(function(){
            var el = document.querySelector(${JSON.stringify(detail.selector)});
            return el ? el.innerText.substring(0, 8000) : '[sélecteur introuvable: ${detail.selector}]';
          })()`
        : `(function(){
            var title = document.title;
            var url = location.href;
            var clone = document.body.cloneNode(true);
            ['script','style','nav','footer','header','aside'].forEach(function(tag){
              Array.from(clone.querySelectorAll(tag)).forEach(function(el){ el.remove(); });
            });
            var text = clone.innerText
              .replace(/[ \\t]{2,}/g, ' ')
              .replace(/\\n{3,}/g, '\\n\\n')
              .substring(0, 8000);
            return JSON.stringify({ title: title, url: url, text: text });
          })()`;

      try {
        const raw = await wv.executeJavaScript(extractScript);
        const token = localStorage.getItem('Leanna_api_token') || '';
        await fetch('/api/browser/content-result', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'x-Leanna-token': token } : {}),
          },
          body: JSON.stringify({ requestId: detail.requestId, result: raw, error: null }),
        });
      } catch (err: any) {
        const token = localStorage.getItem('Leanna_api_token') || '';
        await fetch('/api/browser/content-result', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'x-Leanna-token': token } : {}),
          },
          body: JSON.stringify({ requestId: detail.requestId, result: null, error: err?.message ?? 'Erreur JS dans la webview' }),
        }).catch(() => {/* silent */});
      }
    };

    // ── Helper générique : POST résultat d'action webview → backend
    const postActionResult = async (requestId: string, result: any, error: string | null = null) => {
      try {
        const token = localStorage.getItem('Leanna_api_token') || '';
        await fetch('/api/browser/action-result', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'x-Leanna-token': token } : {}),
          },
          body: JSON.stringify({ requestId, result, error }),
        });
      } catch {/* silent */ }
    };

    // ── Curseur simulé : injection + animation dans la webview ──────────────
    // Injecte (une seule fois) un curseur SVG flottant dans la page,
    // puis l'anime vers la position d'un élément cible avant une action.
    const CURSOR_INJECT_SCRIPT = `(function(){
      if (document.getElementById('__Leanna_cursor')) return;
      var cur = document.createElement('div');
      cur.id = '__Leanna_cursor';
      cur.style.cssText = [
        'position:fixed',
        'top:0','left:0',
        'width:22px','height:22px',
        'pointer-events:none',
        'z-index:2147483647',
        'transition:top 0.25s cubic-bezier(.4,0,.2,1),left 0.25s cubic-bezier(.4,0,.2,1)',
        'will-change:top,left',
        'display:block',
      ].join(';');
      cur.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">'
        + '<filter id="cs"><feDropShadow dx="1" dy="1" stdDeviation="1.5" flood-opacity="0.4"/></filter>'
        + '<polygon points="4,2 4,18 8,14 11,20 13,19 10,13 16,13" fill="white" stroke="var(--text-muted)" stroke-width="1" filter="url(#cs)"/>'
        + '</svg>';
      document.body.appendChild(cur);
    })()`;

    const moveCursorToElement = async (wv: WebviewElement, selector: string): Promise<void> => {
      try {
        // Injecter le curseur si absent
        await wv.executeJavaScript(CURSOR_INJECT_SCRIPT);
        // Déplacer vers le centre de l'élément cible
        const moveScript = `(function(){
          var el = document.querySelector(${JSON.stringify(selector)});
          if (!el) return;
          var r = el.getBoundingClientRect();
          var cur = document.getElementById('__Leanna_cursor');
          if (!cur) return;
          cur.style.left = (r.left + r.width / 2 - 4) + 'px';
          cur.style.top  = (r.top  + r.height / 2 - 2) + 'px';
        })()`;
        await wv.executeJavaScript(moveScript);
        // Laisser l'animation CSS se jouer (250 ms transition + 100 ms pause)
        await new Promise<void>((r) => setTimeout(r, 380));
        // Effet ripple au clic
        const rippleScript = `(function(){
          var el = document.querySelector(${JSON.stringify(selector)});
          if (!el) return;
          var r = el.getBoundingClientRect();
          var rip = document.createElement('div');
          rip.style.cssText = [
            'position:fixed',
            'pointer-events:none',
            'z-index:2147483646',
            'border-radius:50%',
            'border:2px solid rgba(139,92,246,0.8)',
            'width:8px','height:8px',
            'left:' + (r.left + r.width/2 - 4) + 'px',
            'top:' + (r.top + r.height/2 - 4) + 'px',
            'transition:all 0.35s ease-out',
            'opacity:1',
          ].join(';');
          document.body.appendChild(rip);
          requestAnimationFrame(function(){
            rip.style.width  = '36px';
            rip.style.height = '36px';
            rip.style.left   = (r.left + r.width/2 - 18) + 'px';
            rip.style.top    = (r.top + r.height/2 - 18) + 'px';
            rip.style.opacity = '0';
          });
          setTimeout(function(){ rip.remove(); }, 400);
        })()`;
        await wv.executeJavaScript(rippleScript);
      } catch {/* ne bloque pas l'action si l'animation échoue */ }
    };

    // ── Clic sur un élément
    const handleClick = async (e: Event) => {
      const detail = (e as CustomEvent).detail as { requestId: string; selector: string };
      const wv = webviewRef.current;
      if (!wv) {
        postActionResult(detail.requestId, null, 'Webview non disponible.');
        return;
      }
      try {
        // Animer le curseur vers la cible avant le clic
        await moveCursorToElement(wv, detail.selector);

        const clickScript = `(function(){
          var el = document.querySelector(${JSON.stringify(detail.selector)});
          if (!el) return JSON.stringify({ error: 'Sélecteur introuvable: ${detail.selector.replace(/'/g, "\\'")}' });
          var evt = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
          el.dispatchEvent(evt);
          return JSON.stringify({ ok: true });
        })()`;
        const raw = await wv.executeJavaScript(clickScript);
        let parsed: any = {};
        try { parsed = typeof raw === 'string' && raw.startsWith('{') ? JSON.parse(raw) : {}; } catch (e) {
          console.debug('[BrowserPanel] JSON parse failed (click action):', e, raw);
        }
        if (parsed?.error) {
          await postActionResult(detail.requestId, null, parsed.error);
          return;
        }
        setTimeout(async () => {
          try {
            const content = await wv.executeJavaScript(`document.body.innerText.substring(0, 3000)`);
            postActionResult(detail.requestId, { content });
          } catch (e) {
            console.debug('[BrowserPanel] Failed to get page content:', e);
            postActionResult(detail.requestId, {});
          }
        }, 1200);
      } catch (err: any) {
        postActionResult(detail.requestId, null, err?.message ?? 'Erreur clic');
      }
    };

    // ── Saisie dans un champ
    const handleType = async (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        requestId: string; selector: string; text: string; pressEnter?: boolean;
      };
      const wv = webviewRef.current;
      if (!wv) {
        postActionResult(detail.requestId, null, 'Webview non disponible.');
        return;
      }
      try {
        // Animer le curseur vers le champ avant la saisie
        await moveCursorToElement(wv, detail.selector);

        const typeScript = `(function(){
          var el = document.querySelector(${JSON.stringify(detail.selector)});
          if (!el) return JSON.stringify({ error: 'Sélecteur introuvable' });
          el.focus();
          if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
            el.value = ${JSON.stringify(detail.text)};
          } else {
            el.setAttribute('contenteditable', 'true');
            el.innerText = ${JSON.stringify(detail.text)};
          }
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return JSON.stringify({ ok: true });
        })()`;
        const raw = await wv.executeJavaScript(typeScript);
        let parsed: any = {};
        try { parsed = typeof raw === 'string' && raw.startsWith('{') ? JSON.parse(raw) : {}; } catch (e) {
          console.debug('[BrowserPanel] JSON parse failed (type action):', e, raw);
        }
        if (parsed?.error) {
          await postActionResult(detail.requestId, null, parsed.error);
          return;
        }
        if (detail.pressEnter) {
          setTimeout(async () => {
            try {
              await wv.executeJavaScript(`
                (function(){
                  var el = document.querySelector(${JSON.stringify(detail.selector)});
                  if (el) {
                    var ev = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true });
                    el.dispatchEvent(ev);
                    ev = new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true });
                    el.dispatchEvent(ev);
                  }
                })();
              `);
            } catch {/* ignore */ }
            postActionResult(detail.requestId, { ok: true });
          }, 300);
        } else {
          postActionResult(detail.requestId, { ok: true });
        }
      } catch (err: any) {
        postActionResult(detail.requestId, null, err?.message ?? 'Erreur saisie');
      }
    };

    // ── Extraction des liens de la page
    const handleGetLinks = async (e: Event) => {
      const detail = (e as CustomEvent).detail as { requestId: string; selector: string | null };
      const wv = webviewRef.current;
      if (!wv) {
        postActionResult(detail.requestId, null, 'Webview non disponible.');
        return;
      }
      const selectorExpr = detail.selector
        ? JSON.stringify(detail.selector + ' a[href]')
        : '"a[href]"';
      const getLinksScript = `(function(){
        try {
          var seen = {};
          var links = Array.from(document.querySelectorAll(${selectorExpr}))
            .map(function(a) {
              var href = a.getAttribute('href');
              if (!href || href === '#' || href.startsWith('javascript:')) return null;
              try { href = new URL(href, location.href).href; } catch(e) { return null; }
              if (seen[href]) return null;
              seen[href] = true;
              return { text: (a.innerText || a.getAttribute('aria-label') || '').trim().substring(0, 200), href: href };
            })
            .filter(Boolean);
          return JSON.stringify(links);
        } catch(e) {
          return JSON.stringify({ error: e.message });
        }
      })()`;
      try {
        const raw = await wv.executeJavaScript(getLinksScript);
        let parsed: any;
        try {
          parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        } catch {
          parsed = [];
        }
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.error) {
          await postActionResult(detail.requestId, null, parsed.error);
          return;
        }
        await postActionResult(detail.requestId, Array.isArray(parsed) ? parsed : []);
      } catch (err: any) {
        await postActionResult(detail.requestId, null, err?.message ?? 'Erreur extraction liens');
      }
    };

    // ── Snapshot des éléments interactifs
    const handleSnapshot = async (e: Event) => {
      const detail = (e as CustomEvent).detail as { requestId: string };
      const wv = webviewRef.current;
      if (!wv) {
        postActionResult(detail.requestId, null, 'Webview non disponible.');
        return;
      }
      const snapshotScript = `(function(){
        var bestSelector = function(el) {
          if (el.id) return '#' + CSS.escape(el.id);
          var testId = el.getAttribute('data-testid') || el.getAttribute('data-test-id');
          if (testId) return '[data-testid="' + CSS.escape(testId) + '"]';
          var name = el.name;
          if (name) return el.tagName.toLowerCase() + '[name="' + CSS.escape(name) + '"]';
          var placeholder = el.placeholder;
          if (placeholder) return el.tagName.toLowerCase() + '[placeholder="' + CSS.escape(placeholder) + '"]';
          var ariaLabel = el.getAttribute('aria-label');
          if (ariaLabel) return '[aria-label="' + CSS.escape(ariaLabel) + '"]';
          var role = el.getAttribute('role');
          if (role) return '[role="' + role + '"]';
          return el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).trim().split(/\\s+/).slice(0, 2).join('.') : '');
        };
        var inputs = Array.from(document.querySelectorAll(
          'input:not([type="hidden"]), textarea, select, [role="textbox"], [role="combobox"], [role="searchbox"]'
        )).slice(0, 20).map(function(el) {
          return {
            selector: bestSelector(el),
            tag: el.tagName.toLowerCase(),
            type: el.type || el.getAttribute('role') || '',
            placeholder: el.placeholder || el.getAttribute('aria-placeholder') || '',
            ariaLabel: el.getAttribute('aria-label') || '',
            name: el.name || '',
            visible: el.offsetParent !== null
          };
        });
        var buttons = Array.from(document.querySelectorAll(
          'button, input[type="submit"], input[type="button"], a[href], [role="button"]'
        )).filter(function(el) { return el.offsetParent !== null; }).slice(0, 15).map(function(el) {
          return {
            selector: bestSelector(el),
            text: (el.innerText || el.getAttribute('aria-label') || el.value || '').trim().substring(0, 80),
            ariaLabel: el.getAttribute('aria-label') || ''
          };
        });
        return JSON.stringify({ url: location.href, title: document.title, inputs: inputs, buttons: buttons });
      })()`;
      try {
        const raw = await wv.executeJavaScript(snapshotScript);
        const parsed = typeof raw === 'string' && raw.startsWith('{') ? JSON.parse(raw) : raw;
        postActionResult(detail.requestId, parsed);
      } catch (err: any) {
        postActionResult(detail.requestId, null, err?.message ?? 'Erreur snapshot');
      }
    };

    // ── Inspection d'éléments spécifiques (CORRIGÉ : ajout du paramètre type)
    const handleInspect = async (e: Event) => {
      const detail = (e as CustomEvent).detail as { requestId: string; inspectType: 'buttons' | 'inputs' | 'links' | 'all' };
      const wv = webviewRef.current;
      if (!wv) {
        postActionResult(detail.requestId, null, 'Webview non disponible.');
        return;
      }
      // La fonction anonyme prend désormais un paramètre `type`
      const inspectScript = `(function(type){
        var bestSelector = function(el) {
          if (el.id) return '#' + CSS.escape(el.id);
          var testId = el.getAttribute('data-testid') || el.getAttribute('data-test-id');
          if (testId) return '[data-testid="' + CSS.escape(testId) + '"]';
          var name = el.name;
          if (name) return el.tagName.toLowerCase() + '[name="' + CSS.escape(name) + '"]';
          var placeholder = el.placeholder;
          if (placeholder) return el.tagName.toLowerCase() + '[placeholder="' + CSS.escape(placeholder) + '"]';
          var ariaLabel = el.getAttribute('aria-label');
          if (ariaLabel) return '[aria-label="' + CSS.escape(ariaLabel) + '"]';
          return el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).trim().split(/\\s+/).slice(0, 2).join('.') : '');
        };
        var results = {};
        if (type === 'buttons' || type === 'all') {
          results.buttons = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"], [role="button"]')).map(function(btn) { return { selector: bestSelector(btn), text: (btn.innerText || btn.value || '').trim().substring(0, 80), ariaLabel: btn.getAttribute('aria-label') || '' }; }).slice(0, 12);
        }
        if (type === 'inputs' || type === 'all') {
          results.inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]), textarea, select')).map(function(input) { return { selector: bestSelector(input), type: input.type || 'textarea', placeholder: input.placeholder || '', ariaLabel: input.getAttribute('aria-label') || '', name: input.name || '' }; }).slice(0, 12);
        }
        if (type === 'links' || type === 'all') {
          results.links = Array.from(document.querySelectorAll('a[href]')).map(function(link) { return { selector: bestSelector(link), text: (link.innerText || '').trim().substring(0, 80), href: link.href || '' }; }).slice(0, 12);
        }
        return JSON.stringify(results);
      })(${JSON.stringify(detail.inspectType || 'all')})`;
      try {
        const raw = await wv.executeJavaScript(inspectScript);
        const parsed = typeof raw === 'string' && raw.startsWith('{') ? JSON.parse(raw) : {};
        postActionResult(detail.requestId, parsed);
      } catch (err: any) {
        postActionResult(detail.requestId, null, err?.message ?? 'Erreur inspect');
      }
    };

    // ── Déplacement explicite du curseur simulé vers des coordonnées (x, y)
    const handleMouseMove = async (e: Event) => {
      const detail = (e as CustomEvent).detail as { x: number; y: number };
      const wv = webviewRef.current;
      if (!wv) return;
      const lx = (Number(detail.x) || 0) - 4;
      const ly = (Number(detail.y) || 0) - 2;
      try {
        await wv.executeJavaScript(CURSOR_INJECT_SCRIPT);
        await wv.executeJavaScript(
          `(function(x,y){ var cur=document.getElementById('__Leanna_cursor'); if(cur){cur.style.left=x+'px';cur.style.top=y+'px';} })(${lx},${ly})`
        );
      } catch {/* silent */ }
    };

    // ── Helper : attente d'une condition dans la webview (Sprint 1 — J2) ──────
    // Attente générique avec polling 100ms jusqu'à timeout.
    const waitForConditionInPage = async (
      wv: WebviewElement,
      condition: string,
      conditionType: 'selector' | 'text' | 'url',
      timeoutMs: number
    ): Promise<{ found: boolean; elapsed: number }> => {
      const start = Date.now();
      const interval = 100;
      while (Date.now() - start < timeoutMs) {
        try {
          let found = false;
          if (conditionType === 'selector') {
            found = await wv.executeJavaScript(
              `!!document.querySelector(${JSON.stringify(condition)})`
            ) as boolean;
          } else if (conditionType === 'text') {
            found = await wv.executeJavaScript(
              `document.body.innerText.includes(${JSON.stringify(condition)})`
            ) as boolean;
          } else if (conditionType === 'url') {
            found = await wv.executeJavaScript(
              `location.href.includes(${JSON.stringify(condition)})`
            ) as boolean;
          }
          if (found) return { found: true, elapsed: Date.now() - start };
        } catch {/* page still loading */ }
        await new Promise<void>((r) => setTimeout(r, interval));
      }
      return { found: false, elapsed: timeoutMs };
    };

    // ── Sprint 1 — J1 : Snapshot accessibilité (ARIA tree) ───────────────────
    const handleAccessibilitySnapshot = async (e: Event) => {
      const detail = (e as CustomEvent).detail as { requestId: string };
      const wv = webviewRef.current;
      if (!wv) {
        postActionResult(detail.requestId, null, 'Webview non disponible.');
        return;
      }
      const ariaScript = `(function(){
        var INTERACTIVE_ROLES = ['button','link','textbox','combobox','listbox','checkbox',
          'radio','menuitem','menuitemcheckbox','menuitemradio','option','tab','switch',
          'slider','spinbutton','searchbox','tree','treeitem','gridcell','columnheader'];
        var bestSelector = function(el) {
          if (el.id) return '#' + CSS.escape(el.id);
          var testId = el.getAttribute('data-testid') || el.getAttribute('data-test-id');
          if (testId) return '[data-testid="' + CSS.escape(testId) + '"]';
          var ariaLabelledBy = el.getAttribute('aria-labelledby');
          if (ariaLabelledBy) {
            var labelEl = document.getElementById(ariaLabelledBy);
            if (labelEl) return '[aria-labelledby="' + CSS.escape(ariaLabelledBy) + '"]';
          }
          var ariaLabel = el.getAttribute('aria-label');
          if (ariaLabel) return '[aria-label="' + CSS.escape(ariaLabel) + '"]';
          var name = el.name;
          if (name) return el.tagName.toLowerCase() + '[name="' + CSS.escape(name) + '"]';
          var role = el.getAttribute('role');
          if (role) return el.tagName.toLowerCase() + '[role="' + role + '"]';
          return el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).trim().split(/\\s+/).slice(0,2).join('.') : '');
        };
        var getAccessibleName = function(el) {
          var label = el.getAttribute('aria-label');
          if (label) return label.trim();
          var labelledBy = el.getAttribute('aria-labelledby');
          if (labelledBy) {
            var parts = labelledBy.split(/\\s+/).map(function(id){
              var ref = document.getElementById(id);
              return ref ? ref.innerText.trim() : '';
            }).filter(Boolean);
            if (parts.length) return parts.join(' ');
          }
          var forEl = el.id ? document.querySelector('label[for="' + CSS.escape(el.id) + '"]') : null;
          if (forEl) return forEl.innerText.trim();
          var placeholder = el.getAttribute('placeholder') || el.getAttribute('aria-placeholder');
          if (placeholder) return placeholder.trim();
          var text = (el.innerText || el.textContent || el.value || el.getAttribute('title') || '').trim();
          return text.substring(0, 100);
        };
        var elements = [];
        var seen = new WeakSet();
        // 1. Éléments avec rôle ARIA explicite
        INTERACTIVE_ROLES.forEach(function(role) {
          Array.from(document.querySelectorAll('[role="' + role + '"]')).forEach(function(el) {
            if (seen.has(el) || el.offsetParent === null) return;
            seen.add(el);
            elements.push({
              role: role,
              name: getAccessibleName(el),
              selector: bestSelector(el),
              tag: el.tagName.toLowerCase(),
              disabled: el.getAttribute('aria-disabled') === 'true' || el.hasAttribute('disabled'),
              checked: el.getAttribute('aria-checked'),
              expanded: el.getAttribute('aria-expanded'),
              required: el.getAttribute('aria-required') === 'true' || el.hasAttribute('required'),
            });
          });
        });
        // 2. Éléments HTML natifs (boutons, inputs, liens, selects)
        var nativeSelectors = [
          { sel: 'button:not([aria-hidden="true"])', role: 'button' },
          { sel: 'input:not([type="hidden"]):not([aria-hidden="true"])', role: 'textbox' },
          { sel: 'textarea:not([aria-hidden="true"])', role: 'textbox' },
          { sel: 'select:not([aria-hidden="true"])', role: 'combobox' },
          { sel: 'a[href]:not([aria-hidden="true"])', role: 'link' },
        ];
        nativeSelectors.forEach(function(def) {
          Array.from(document.querySelectorAll(def.sel)).forEach(function(el) {
            if (seen.has(el) || el.offsetParent === null) return;
            seen.add(el);
            var inferredRole = el.getAttribute('type') === 'checkbox' ? 'checkbox'
              : el.getAttribute('type') === 'radio' ? 'radio'
              : el.getAttribute('type') === 'submit' || el.getAttribute('type') === 'button' ? 'button'
              : def.role;
            elements.push({
              role: inferredRole,
              name: getAccessibleName(el),
              selector: bestSelector(el),
              tag: el.tagName.toLowerCase(),
              disabled: el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true',
              checked: el.checked !== undefined ? el.checked : null,
              expanded: el.getAttribute('aria-expanded'),
              required: el.hasAttribute('required') || el.getAttribute('aria-required') === 'true',
            });
          });
        });
        var stats = {
          total: elements.length,
          byRole: {}
        };
        elements.forEach(function(el) {
          stats.byRole[el.role] = (stats.byRole[el.role] || 0) + 1;
        });
        return JSON.stringify({ url: location.href, title: document.title, elements: elements, stats: stats });
      })()`;
      try {
        const raw = await wv.executeJavaScript(ariaScript);
        const parsed = typeof raw === 'string' && raw.startsWith('{') ? JSON.parse(raw) : {};
        postActionResult(detail.requestId, parsed);
      } catch (err: any) {
        postActionResult(detail.requestId, null, err?.message ?? 'Erreur accessibility snapshot');
      }
    };

    // ── Sprint 1 — J1 : Clic par rôle ARIA ───────────────────────────────────
    const handleClickByRole = async (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        requestId: string;
        role: string;
        accessibleName: string;
        waitFor: string | null;
      };
      const wv = webviewRef.current;
      if (!wv) {
        postActionResult(detail.requestId, null, 'Webview non disponible.');
        return;
      }
      const clickByRoleScript = `(function(role, name){
        var getAccessibleName = function(el) {
          var label = el.getAttribute('aria-label');
          if (label) return label.trim().toLowerCase();
          var labelledBy = el.getAttribute('aria-labelledby');
          if (labelledBy) {
            var parts = labelledBy.split(/\\s+/).map(function(id){
              var ref = document.getElementById(id);
              return ref ? ref.innerText.trim() : '';
            }).filter(Boolean);
            if (parts.length) return parts.join(' ').toLowerCase();
          }
          var forEl = el.id ? document.querySelector('label[for="' + CSS.escape(el.id) + '"]') : null;
          if (forEl) return forEl.innerText.trim().toLowerCase();
          return (el.innerText || el.textContent || el.value || el.getAttribute('placeholder') || el.getAttribute('title') || '').trim().toLowerCase();
        };
        var nameLower = name.toLowerCase();
        // Chercher par rôle ARIA explicite
        var candidates = Array.from(document.querySelectorAll('[role="' + role + '"]'));
        // Ajouter les éléments HTML natifs selon le rôle
        if (role === 'button') candidates = candidates.concat(Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"]')));
        if (role === 'link') candidates = candidates.concat(Array.from(document.querySelectorAll('a[href]')));
        if (role === 'textbox') candidates = candidates.concat(Array.from(document.querySelectorAll('input:not([type="hidden"]), textarea')));
        if (role === 'combobox') candidates = candidates.concat(Array.from(document.querySelectorAll('select')));
        if (role === 'checkbox') candidates = candidates.concat(Array.from(document.querySelectorAll('input[type="checkbox"]')));
        if (role === 'radio') candidates = candidates.concat(Array.from(document.querySelectorAll('input[type="radio"]')));
        // Dédupliquer et filtrer par nom
        var seen = new WeakSet();
        var match = null;
        for (var i = 0; i < candidates.length; i++) {
          var el = candidates[i];
          if (seen.has(el)) continue;
          seen.add(el);
          if (el.offsetParent === null) continue; // invisible
          if (nameLower && !getAccessibleName(el).includes(nameLower)) continue;
          match = el;
          break;
        }
        if (!match) return JSON.stringify({ error: 'Aucun élément [role="' + role + '"] avec le nom "' + name + '" trouvé.' });
        var evt = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
        match.dispatchEvent(evt);
        return JSON.stringify({ ok: true });
      })(${JSON.stringify(detail.role)}, ${JSON.stringify(detail.accessibleName)})`;
      try {
        await moveCursorToElement(wv, `[role="${detail.role}"]`).catch(() => {/* ignore si pas trouvé */ });
        const raw = await wv.executeJavaScript(clickByRoleScript);
        let parsed: any = {};
        try { parsed = typeof raw === 'string' && raw.startsWith('{') ? JSON.parse(raw) : {}; } catch (e) {
          console.debug('[BrowserPanel] JSON parse failed (clickByRole):', e, raw);
        }
        if (parsed?.error) {
          postActionResult(detail.requestId, null, parsed.error);
          return;
        }
        // Attendre la condition waitFor si fournie
        let changed: Record<string, boolean> = {};
        if (detail.waitFor) {
          const urlBefore = await wv.executeJavaScript('location.href').catch(() => '') as string;
          const waitResult = await waitForConditionInPage(wv, detail.waitFor, 'selector', 5000);
          if (!waitResult.found) {
            // Essayer en mode texte
            const textResult = await waitForConditionInPage(wv, detail.waitFor, 'text', 2000);
            changed = { elementAppeared: textResult.found };
          } else {
            changed = { elementAppeared: true };
          }
          const urlAfter = await wv.executeJavaScript('location.href').catch(() => '') as string;
          changed.url = urlAfter !== urlBefore;
        }
        postActionResult(detail.requestId, { ok: true, changed });
      } catch (err: any) {
        postActionResult(detail.requestId, null, err?.message ?? 'Erreur click-by-role');
      }
    };

    // ── Sprint 1 — J1 : Saisie par libellé ───────────────────────────────────
    const handleTypeByLabel = async (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        requestId: string;
        label: string;
        text: string;
        pressEnter: boolean;
        waitFor: string | null;
      };
      const wv = webviewRef.current;
      if (!wv) {
        postActionResult(detail.requestId, null, 'Webview non disponible.');
        return;
      }
      const typeByLabelScript = `(function(label, text){
        var labelLower = label.toLowerCase();
        var field = null;
        // 1. Recherche par aria-label
        var byAriaLabel = Array.from(document.querySelectorAll('input,textarea,select,[contenteditable]')).find(function(el){
          return (el.getAttribute('aria-label') || '').toLowerCase().includes(labelLower);
        });
        if (byAriaLabel) field = byAriaLabel;
        // 2. Recherche par <label for="...">
        if (!field) {
          var labels = Array.from(document.querySelectorAll('label'));
          for (var i = 0; i < labels.length; i++) {
            if (labels[i].innerText.toLowerCase().includes(labelLower)) {
              var forId = labels[i].getAttribute('for');
              if (forId) {
                field = document.getElementById(forId);
                if (field) break;
              }
              // label wrapping
              field = labels[i].querySelector('input,textarea,select');
              if (field) break;
            }
          }
        }
        // 3. Recherche par placeholder
        if (!field) {
          field = Array.from(document.querySelectorAll('input,textarea')).find(function(el){
            return (el.placeholder || el.getAttribute('aria-placeholder') || '').toLowerCase().includes(labelLower);
          }) || null;
        }
        if (!field) return JSON.stringify({ error: 'Champ avec le libellé "' + label + '" introuvable.' });
        field.focus();
        // Effacer le contenu existant
        if (field.tagName.toLowerCase() !== 'select') {
          if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
            field.value = '';
            field.dispatchEvent(new Event('input', { bubbles: true }));
          } else {
            field.innerHTML = '';
          }
        }
        // Saisie caractère par caractère
        for (var c = 0; c < text.length; c++) {
          var char = text[c];
          field.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
          if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
            field.value += char;
          } else {
            field.textContent += char;
          }
          field.dispatchEvent(new Event('input', { bubbles: true }));
          field.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));
        }
        field.dispatchEvent(new Event('change', { bubbles: true }));
        return JSON.stringify({ ok: true, selector: field.id ? '#' + field.id : field.tagName.toLowerCase() });
      })(${JSON.stringify(detail.label)}, ${JSON.stringify(detail.text)})`;
      try {
        const raw = await wv.executeJavaScript(typeByLabelScript);
        let parsed: any = {};
        try { parsed = typeof raw === 'string' && raw.startsWith('{') ? JSON.parse(raw) : {}; } catch (e) {
          console.debug('[BrowserPanel] JSON parse failed (typeByLabel):', e, raw);
        }
        if (parsed?.error) {
          postActionResult(detail.requestId, null, parsed.error);
          return;
        }
        // pressEnter
        if (detail.pressEnter && parsed?.selector) {
          await new Promise<void>((r) => setTimeout(r, 300));
          await wv.executeJavaScript(`(function(){
            var el = document.querySelector(${JSON.stringify(parsed.selector)});
            if (el) {
              el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
              el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }));
            }
          })()`).catch(() => {/* ignore */});
        }
        // waitFor
        let changed: Record<string, boolean> = {};
        if (detail.waitFor) {
          const waitResult = await waitForConditionInPage(wv, detail.waitFor, 'selector', 5000);
          if (!waitResult.found) {
            const textResult = await waitForConditionInPage(wv, detail.waitFor, 'text', 2000);
            changed = { elementAppeared: textResult.found };
          } else {
            changed = { elementAppeared: true };
          }
        }
        postActionResult(detail.requestId, { ok: true, changed });
      } catch (err: any) {
        postActionResult(detail.requestId, null, err?.message ?? 'Erreur type-by-label');
      }
    };

    // ── Sprint 1 — J2 : Attente de condition ─────────────────────────────────
    const handleWaitFor = async (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        requestId: string;
        condition: string;
        conditionType: 'selector' | 'text' | 'url';
        timeout: number;
      };
      const wv = webviewRef.current;
      if (!wv) {
        postActionResult(detail.requestId, null, 'Webview non disponible.');
        return;
      }
      try {
        const result = await waitForConditionInPage(
          wv,
          detail.condition,
          detail.conditionType ?? 'selector',
          detail.timeout ?? 10_000
        );
        postActionResult(detail.requestId, result);
      } catch (err: any) {
        postActionResult(detail.requestId, null, err?.message ?? 'Erreur wait-for');
      }
    };

    // ── Sprint 1 — J3 : Texte d'un élément ───────────────────────────────────
    const handleGetElementText = async (e: Event) => {
      const detail = (e as CustomEvent).detail as { requestId: string; selector: string };
      const wv = webviewRef.current;
      if (!wv) {
        postActionResult(detail.requestId, null, 'Webview non disponible.');
        return;
      }
      const script = `(function(){
        var el = document.querySelector(${JSON.stringify(detail.selector)});
        if (!el) return JSON.stringify({ found: false });
        var text = el.innerText !== undefined ? el.innerText : (el.textContent || el.getAttribute('value') || '');
        return JSON.stringify({ found: true, text: text.trim().substring(0, 2000) });
      })()`;
      try {
        const raw = await wv.executeJavaScript(script);
        const parsed = typeof raw === 'string' && raw.startsWith('{') ? JSON.parse(raw) : { found: false };
        postActionResult(detail.requestId, parsed);
      } catch (err: any) {
        postActionResult(detail.requestId, null, err?.message ?? 'Erreur get-element-text');
      }
    };

    // ── Sprint 1 — J3 : Attribut d'un élément ────────────────────────────────
    const handleGetElementAttribute = async (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        requestId: string;
        selector: string;
        attribute: string;
      };
      const wv = webviewRef.current;
      if (!wv) {
        postActionResult(detail.requestId, null, 'Webview non disponible.');
        return;
      }
      const script = `(function(){
        var el = document.querySelector(${JSON.stringify(detail.selector)});
        if (!el) return JSON.stringify({ found: false });
        var val = el.getAttribute(${JSON.stringify(detail.attribute)});
        // Pour 'value', lire la propriété JS plutôt que l'attribut HTML
        if (val === null && ${JSON.stringify(detail.attribute)} === 'value' && el.value !== undefined) {
          val = el.value;
        }
        return JSON.stringify({ found: true, value: val });
      })()`;
      try {
        const raw = await wv.executeJavaScript(script);
        const parsed = typeof raw === 'string' && raw.startsWith('{') ? JSON.parse(raw) : { found: false };
        postActionResult(detail.requestId, parsed);
      } catch (err: any) {
        postActionResult(detail.requestId, null, err?.message ?? 'Erreur get-element-attribute');
      }
    };

    // ── Sprint 1 — J3 : Remplissage de formulaire (fill avec effacement) ─────
    const handleFillForm = async (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        requestId: string;
        selector: string;
        value: string;
        waitFor: string | null;
      };
      const wv = webviewRef.current;
      if (!wv) {
        postActionResult(detail.requestId, null, 'Webview non disponible.');
        return;
      }
      try {
        await moveCursorToElement(wv, detail.selector);
      } catch {/* ignore animation errors */ }
      const script = `(function(){
        var el = document.querySelector(${JSON.stringify(detail.selector)});
        if (!el) return JSON.stringify({ found: false });
        el.focus();
        // Effacer le contenu existant
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
          el.value = '';
        } else {
          el.innerHTML = '';
        }
        el.dispatchEvent(new Event('input', { bubbles: true }));
        // Saisie caractère par caractère pour déclencher les événements React/Vue
        var text = ${JSON.stringify(detail.value)};
        for (var i = 0; i < text.length; i++) {
          var char = text[i];
          el.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
          if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
            el.value += char;
          } else {
            el.textContent = (el.textContent || '') + char;
          }
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));
        }
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return JSON.stringify({ found: true, ok: true });
      })()`;
      try {
        const raw = await wv.executeJavaScript(script);
        let parsed: any = {};
        try { parsed = typeof raw === 'string' && raw.startsWith('{') ? JSON.parse(raw) : {}; } catch (e) {
          console.debug('[BrowserPanel] JSON parse failed (scrollAndClick):', e, raw);
        }
        if (!parsed.found) {
          postActionResult(detail.requestId, { found: false });
          return;
        }
        // waitFor post-action
        let changed: Record<string, boolean> = {};
        if (detail.waitFor) {
          const waitResult = await waitForConditionInPage(wv, detail.waitFor, 'selector', 5000);
          changed = { elementAppeared: waitResult.found };
        }
        postActionResult(detail.requestId, { found: true, ok: true, changed });
      } catch (err: any) {
        postActionResult(detail.requestId, null, err?.message ?? 'Erreur fill-form');
      }
    };

    // ── Sprint 1 — J3 : Sélection d'option dans un <select> ──────────────────
    const handleSelectOption = async (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        requestId: string;
        selector: string;
        value: string;
      };
      const wv = webviewRef.current;
      if (!wv) {
        postActionResult(detail.requestId, null, 'Webview non disponible.');
        return;
      }
      const script = `(function(){
        var el = document.querySelector(${JSON.stringify(detail.selector)});
        if (!el || el.tagName.toLowerCase() !== 'select') return JSON.stringify({ found: false });
        var target = ${JSON.stringify(detail.value)}.toLowerCase();
        var selectedText = null;
        // Chercher par value d'abord, puis par texte visible
        for (var i = 0; i < el.options.length; i++) {
          var opt = el.options[i];
          if (opt.value.toLowerCase() === target || opt.text.toLowerCase().includes(target)) {
            el.value = opt.value;
            selectedText = opt.text;
            break;
          }
        }
        if (selectedText === null) return JSON.stringify({ found: true, ok: false });
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('input', { bubbles: true }));
        return JSON.stringify({ found: true, ok: true, selectedText: selectedText });
      })()`;
      try {
        const raw = await wv.executeJavaScript(script);
        const parsed = typeof raw === 'string' && raw.startsWith('{') ? JSON.parse(raw) : { found: false };
        postActionResult(detail.requestId, parsed);
      } catch (err: any) {
        postActionResult(detail.requestId, null, err?.message ?? 'Erreur select-option');
      }
    };

    // ── Journal console/réseau : Leanna lit les erreurs de la page ───────────
    const handleGetConsole = async (e: Event) => {
      const detail = (e as CustomEvent).detail as { requestId: string; level?: string; limit?: number };
      // Lire le tampon console de l'onglet ACTIF (via son handle).
      const buffer = activeHandle()?.getConsole() ?? [];
      let entries = buffer.slice();
      const level = detail.level ?? 'all';
      if (level === 'error') {
        entries = entries.filter((x) => x.level === 'error' || x.level === 'network');
      } else if (level === 'warn') {
        entries = entries.filter((x) => x.level === 'error' || x.level === 'network' || x.level === 'warn');
      }
      const limit = Math.max(1, Math.min(detail.limit ?? 100, 300));
      // Les plus récents en priorité.
      const sliced = entries.slice(-limit);
      postActionResult(detail.requestId, {
        url: webviewRef.current?.getURL?.() ?? '',
        total: buffer.length,
        returned: sliced.length,
        entries: sliced,
      });
    };

    // ── Capture visuelle : Leanna photographie la page pour l'analyser ───────
    const handleCapture = async (e: Event) => {
      const detail = (e as CustomEvent).detail as { requestId: string };
      const wv = webviewRef.current;
      if (!wv?.capturePage) {
        postActionResult(detail.requestId, null, 'Capture non disponible (webview absente).');
        return;
      }
      try {
        const image = await wv.capturePage();
        if (image.isEmpty()) {
          postActionResult(detail.requestId, null, 'Capture vide (page non rendue).');
          return;
        }
        const base64 = image.toPNG().toString('base64');
        postActionResult(detail.requestId, {
          image: base64,
          mimeType: 'image/png',
          url: wv.getURL?.() ?? '',
          title: wv.getTitle?.() ?? '',
        });
      } catch (err: any) {
        postActionResult(detail.requestId, null, err?.message ?? 'Erreur de capture.');
      }
    };

    window.addEventListener('Leanna-browser-navigate', handleNav);
    window.addEventListener('Leanna-browser-new-tab', handleNewTab as EventListener);
    window.addEventListener('Leanna-browser-scroll', handleScroll);
    window.addEventListener('Leanna-browser-control', handleBrowserControl);
    window.addEventListener('Leanna-browser-read-request', handleReadRequest as EventListener);
    window.addEventListener('Leanna-browser-click', handleClick as EventListener);
    window.addEventListener('Leanna-browser-type', handleType as EventListener);
    window.addEventListener('Leanna-browser-get-links', handleGetLinks as EventListener);
    window.addEventListener('Leanna-browser-snapshot', handleSnapshot as EventListener);
    window.addEventListener('Leanna-browser-inspect', handleInspect as EventListener);
    window.addEventListener('Leanna-browser-mouse-move', handleMouseMove as EventListener);
    // Sprint 1 — J1 : Accessibilité
    window.addEventListener('Leanna-browser-accessibility-snapshot', handleAccessibilitySnapshot as EventListener);
    window.addEventListener('Leanna-browser-click-by-role', handleClickByRole as EventListener);
    window.addEventListener('Leanna-browser-type-by-label', handleTypeByLabel as EventListener);
    // Sprint 1 — J2 : Robustesse
    window.addEventListener('Leanna-browser-wait-for', handleWaitFor as EventListener);
    // Sprint 1 — J3 : Actions primitives
    window.addEventListener('Leanna-browser-get-element-text', handleGetElementText as EventListener);
    window.addEventListener('Leanna-browser-get-element-attribute', handleGetElementAttribute as EventListener);
    window.addEventListener('Leanna-browser-fill-form', handleFillForm as EventListener);
    window.addEventListener('Leanna-browser-select-option', handleSelectOption as EventListener);
    // Journal console/réseau
    window.addEventListener('Leanna-browser-get-console', handleGetConsole as EventListener);
    // Capture visuelle
    window.addEventListener('Leanna-browser-capture', handleCapture as EventListener);
    return () => {
      window.removeEventListener('Leanna-browser-navigate', handleNav);
      window.removeEventListener('Leanna-browser-new-tab', handleNewTab as EventListener);
      window.removeEventListener('Leanna-browser-scroll', handleScroll);
      window.removeEventListener('Leanna-browser-control', handleBrowserControl);
      window.removeEventListener('Leanna-browser-read-request', handleReadRequest as EventListener);
      window.removeEventListener('Leanna-browser-click', handleClick as EventListener);
      window.removeEventListener('Leanna-browser-type', handleType as EventListener);
      window.removeEventListener('Leanna-browser-get-links', handleGetLinks as EventListener);
      window.removeEventListener('Leanna-browser-snapshot', handleSnapshot as EventListener);
      window.removeEventListener('Leanna-browser-inspect', handleInspect as EventListener);
      window.removeEventListener('Leanna-browser-mouse-move', handleMouseMove as EventListener);
      // Sprint 1 — J1 : Accessibilité
      window.removeEventListener('Leanna-browser-accessibility-snapshot', handleAccessibilitySnapshot as EventListener);
      window.removeEventListener('Leanna-browser-click-by-role', handleClickByRole as EventListener);
      window.removeEventListener('Leanna-browser-type-by-label', handleTypeByLabel as EventListener);
      // Sprint 1 — J2 : Robustesse
      window.removeEventListener('Leanna-browser-wait-for', handleWaitFor as EventListener);
      // Sprint 1 — J3 : Actions primitives
      window.removeEventListener('Leanna-browser-get-element-text', handleGetElementText as EventListener);
      window.removeEventListener('Leanna-browser-get-element-attribute', handleGetElementAttribute as EventListener);
      window.removeEventListener('Leanna-browser-fill-form', handleFillForm as EventListener);
      window.removeEventListener('Leanna-browser-select-option', handleSelectOption as EventListener);
      window.removeEventListener('Leanna-browser-get-console', handleGetConsole as EventListener);
      window.removeEventListener('Leanna-browser-capture', handleCapture as EventListener);
    };
  }, [navigateTo, openTab]);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div
      className={`flex flex-col min-h-0 ${fullWidth ? 'flex-1 min-w-0' : 'border-l'}`}
      style={fullWidth ? {
        borderColor: 'var(--border-base)',
        backgroundColor: 'var(--bg-panel)',
      } : {
        width,
        minWidth: width,
        maxWidth: width,
        borderColor: 'var(--border-base)',
        backgroundColor: 'var(--bg-panel)',
      }}
    >
      <BrowserTabStrip
        tabs={tabs.map((t) => ({ id: t.id, title: t.title, url: t.url, loading: t.loading, faviconUrl: t.faviconUrl }))}
        activeTabId={activeTabId}
        onSelect={switchTab}
        onClose={closeTab}
        onNewTab={() => {
          const id = openTab(BROWSER_HOME_URL, true);
          onOpenInNewTab?.(BROWSER_HOME_URL);
          return id;
        }}
      />

      <BrowserToolbar
        pageTitle={pageTitle}
        assistantNavActive={assistantNavActive}
        currentUrl={currentUrl}
        inputValue={inputValue}
        loading={loading}
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        inputRef={inputRef}
        onClose={onClose}
        onInputChange={setInputValue}
        onInputKeyDown={handleInputKeyDown}
        onGoBack={handleGoBack}
        onGoForward={handleGoForward}
        onRefresh={handleRefresh}
        onHome={handleHome}
        onOpenExternal={handleOpenInNewWindow}
        zoomPercent={zoomPercent}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onZoomReset={handleZoomReset}
        onToggleFind={toggleFind}
        onToggleDevTools={handleToggleDevTools}
        getSuggestions={getSuggestions}
        onSelectSuggestion={handleSelectSuggestion}
        onClearHistory={clearHistory}
        profiles={profiles}
        activeProfile={activeProfile}
        onSwitchProfile={switchProfile}
        onCreateProfile={createProfile}
        onRenameProfile={renameProfile}
        onDeleteProfile={deleteProfile}
        extensionsSupported={extensions.supported}
        extensions={extensions.extensions}
        extensionsLoading={extensions.loading}
        extensionsError={extensions.error}
        onLoadExtension={extensions.loadExtension}
        onRemoveExtension={extensions.removeExtension}
      />

      {/* ── Barre de recherche dans la page ── */}
      {findOpen && (
        <BrowserFindBar
          query={findQuery}
          matches={findMatches}
          onChange={handleFindChange}
          onNext={handleFindNext}
          onPrev={handleFindPrev}
          onClose={closeFind}
        />
      )}

      {/* ── Error banner ── */}
      {loadError && (
        <div
          className="flex items-center gap-2 px-3 py-2 text-sm flex-shrink-0"
          style={{
            backgroundColor: 'var(--color-error-subtle)',
            borderBottom: '1px solid var(--border-error-subtle)',
            color: 'var(--color-error)',
          }}
        >
          <AlertTriangle size={13} className="flex-shrink-0" />
          <span className="flex-1 truncate">{loadError}</span>
        </div>
      )}

      {/* ── Webviews (une par onglet, inactives masquées) ── */}
      <div
        className="flex-1 min-h-0 relative"
        style={{ visibility: isExternalWindowOpen ? 'hidden' : 'visible' }}
      >
        {tabs.map((t) => (
          <BrowserTabView
            // key = id d'onglet + partition : changer de profil remonte la
            // <webview> (partition immuable après attache).
            key={`${t.id}:${partition}`}
            tabId={t.id}
            active={t.id === activeTabId}
            partition={partition}
            initialUrl={t.url}
            onState={handleTabState}
            onRegister={handleTabRegister}
            onActiveWebview={handleActiveWebview}
          />
        ))}

        {isExternalWindowOpen && (
          <BrowserExternalOverlay
            onDismiss={() => {
              if (externalWindowRef.current && !externalWindowRef.current.closed) {
                externalWindowRef.current.close();
              }
              setIsExternalWindowOpen(false);
              externalWindowRef.current = null;
            }}
          />
        )}
      </div>
    </div>
  );
}