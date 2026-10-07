/**
 * BrowserTabView — un onglet = une <webview> Electron persistante.
 *
 * Chaque onglet garde sa propre webview montée (masquée via CSS quand il n'est
 * pas actif), son propre tampon console/réseau, et son propre cycle dom-ready /
 * URL en attente. Le composant remonte à ses parents (via `onState`) les
 * changements d'URL/titre/chargement/navigation, et expose l'élément <webview>
 * actif au parent via `onActiveWebview` pour que les 27 outils IPC existants
 * continuent de piloter l'onglet actif sans modification.
 */

import { useEffect, useRef } from 'react';
import type {
  WebviewElement,
  WebviewFailLoadEvent,
  WebviewFaviconEvent,
  WebviewNavigateEvent,
  WebviewTitleEvent,
} from './browserTypes.js';

export interface ConsoleEntry {
  level: string;
  message: string;
  source?: string;
  line?: number;
  ts: number;
}

/** Patch d'état d'onglet remonté au parent. */
export interface TabStatePatch {
  url?: string;
  title?: string;
  loading?: boolean;
  canGoBack?: boolean;
  canGoForward?: boolean;
  loadError?: string | null;
  faviconUrl?: string | null;
}

export interface BrowserTabHandle {
  loadURL(url: string): void;
  reload(): void;
  stop(): void;
  goBack(): void;
  goForward(): void;
  /** L'élément <webview> natif (ou null si pas encore prêt). */
  getWebview(): WebviewElement | null;
  /** Lecture du tampon console/réseau de cet onglet. */
  getConsole(): ConsoleEntry[];
}

interface BrowserTabViewProps {
  tabId: string;
  active: boolean;
  partition: string;
  /** URL initiale chargée au montage de la webview. */
  initialUrl: string;
  /** Remonte un patch d'état au parent (seulement pour cet onglet). */
  onState: (tabId: string, patch: TabStatePatch) => void;
  /** Enregistre le handle impératif de l'onglet auprès du parent. */
  onRegister: (tabId: string, handle: BrowserTabHandle | null) => void;
  /** Appelé quand l'onglet actif a une nouvelle webview prête (pour webviewRef). */
  onActiveWebview?: (wv: WebviewElement | null) => void;
}

const MAX_CONSOLE_ENTRIES = 300;

export function BrowserTabView({
  tabId,
  active,
  partition,
  initialUrl,
  onState,
  onRegister,
  onActiveWebview,
}: BrowserTabViewProps) {
  const webviewRef = useRef<WebviewElement>(null);
  const domReadyRef = useRef(false);
  const pendingUrlRef = useRef<string | null>(null);
  const consoleBufferRef = useRef<ConsoleEntry[]>([]);

  // Refs stables vers les callbacks parent : l'effet d'abonnement tourne avec
  // [partition] et ne doit pas se réabonner à chaque changement de callback.
  const onStateRef = useRef(onState);
  const onRegisterRef = useRef(onRegister);
  const onActiveWebviewRef = useRef(onActiveWebview);
  const activeRef = useRef(active);
  useEffect(() => { onStateRef.current = onState; }, [onState]);
  useEffect(() => { onRegisterRef.current = onRegister; }, [onRegister]);
  useEffect(() => { onActiveWebviewRef.current = onActiveWebview; }, [onActiveWebview]);
  useEffect(() => { activeRef.current = active; }, [active]);

  // ── Événements natifs de la webview (par onglet) ────────────────────────────
  useEffect(() => {
    const wv = webviewRef.current;
    if (!wv) return;

    const pushConsole = (entry: Omit<ConsoleEntry, 'ts'>) => {
      const buf = consoleBufferRef.current;
      buf.push({ ...entry, ts: Date.now() });
      if (buf.length > MAX_CONSOLE_ENTRIES) buf.splice(0, buf.length - MAX_CONSOLE_ENTRIES);
    };

    const handle: BrowserTabHandle = {
      loadURL: (url: string) => {
        if (domReadyRef.current) wv.loadURL(url);
        else pendingUrlRef.current = url;
      },
      reload: () => wv.reload(),
      stop: () => wv.stop(),
      goBack: () => wv.goBack(),
      goForward: () => wv.goForward(),
      getWebview: () => webviewRef.current,
      getConsole: () => consoleBufferRef.current.slice(),
    };
    onRegisterRef.current(tabId, handle);

    const onDomReady = () => {
      domReadyRef.current = true;
      if (pendingUrlRef.current) {
        wv.loadURL(pendingUrlRef.current);
        pendingUrlRef.current = null;
      }
    };
    const onLoadStart = () => onStateRef.current(tabId, { loading: true, loadError: null });
    const onLoadStop = () => {
      const url = wv.getURL();
      onStateRef.current(tabId, {
        loading: false,
        url,
        title: wv.getTitle?.() ?? '',
        canGoBack: wv.canGoBack(),
        canGoForward: wv.canGoForward(),
      });
      window.dispatchEvent(new CustomEvent('Leanna-browser-navigated', { detail: { url } }));
    };
    const onTitleUpdate = (e: Event) => {
      const title = (e as WebviewTitleEvent).title;
      onStateRef.current(tabId, { title });
      window.dispatchEvent(new CustomEvent('Leanna-browser-title-updated', { detail: { title, url: wv.getURL() } }));
    };
    const onConsoleMessage = (e: Event) => {
      const ev = e as unknown as { level: number; message: string; line: number; sourceId: string };
      const level = ev.level === 3 ? 'error' : ev.level === 2 ? 'warn' : ev.level === 1 ? 'info' : 'log';
      pushConsole({ level, message: String(ev.message ?? ''), source: ev.sourceId, line: ev.line });
    };
    const onFailLoad = (e: Event) => {
      const ev = e as WebviewFailLoadEvent;
      if (ev.isMainFrame === false) {
        if (ev.errorCode !== -3) {
          pushConsole({ level: 'network', message: `Échec ressource (${ev.errorCode} ${ev.errorDescription}) : ${ev.validatedURL ?? ''}` });
        }
        return;
      }
      if (ev.errorCode === -3) {
        onStateRef.current(tabId, { loading: false });
        return;
      }
      pushConsole({ level: 'network', message: `Échec chargement page (${ev.errorCode} ${ev.errorDescription}) : ${ev.validatedURL ?? ''}` });
      onStateRef.current(tabId, { loading: false, loadError: `Impossible de charger cette page (${ev.errorDescription})` });
    };
    const onNavigate = (e: Event) => {
      const ev = e as WebviewNavigateEvent;
      if (ev.isMainFrame !== false && e.type === 'did-navigate') {
        consoleBufferRef.current = [];
        // Nouvelle page : réinitialiser le favicon jusqu'à ce que la page en fournisse un.
        onStateRef.current(tabId, { faviconUrl: null });
      }
      onStateRef.current(tabId, {
        url: ev.url,
        canGoBack: wv.canGoBack(),
        canGoForward: wv.canGoForward(),
      });
    };
    const onFaviconUpdate = (e: Event) => {
      const favicons = (e as WebviewFaviconEvent).favicons;
      if (Array.isArray(favicons) && favicons[0]) {
        onStateRef.current(tabId, { faviconUrl: favicons[0] });
      }
    };

    wv.addEventListener('dom-ready', onDomReady);
    wv.addEventListener('did-start-loading', onLoadStart);
    wv.addEventListener('did-stop-loading', onLoadStop);
    wv.addEventListener('page-title-updated', onTitleUpdate);
    wv.addEventListener('did-fail-load', onFailLoad);
    wv.addEventListener('did-navigate', onNavigate);
    wv.addEventListener('did-navigate-in-page', onNavigate);
    wv.addEventListener('console-message', onConsoleMessage);
    wv.addEventListener('page-favicon-updated', onFaviconUpdate);

    // Si cet onglet est actif au montage, exposer immédiatement sa webview.
    if (activeRef.current) onActiveWebviewRef.current?.(wv);

    return () => {
      domReadyRef.current = false;
      onRegisterRef.current(tabId, null);
      wv.removeEventListener('dom-ready', onDomReady);
      wv.removeEventListener('did-start-loading', onLoadStart);
      wv.removeEventListener('did-stop-loading', onLoadStop);
      wv.removeEventListener('page-title-updated', onTitleUpdate);
      wv.removeEventListener('did-fail-load', onFailLoad);
      wv.removeEventListener('did-navigate', onNavigate);
      wv.removeEventListener('did-navigate-in-page', onNavigate);
      wv.removeEventListener('console-message', onConsoleMessage);
      wv.removeEventListener('page-favicon-updated', onFaviconUpdate);
    };
    // partition : un changement de profil remonte la <webview> ; on réabonne.
  }, [tabId, partition]);

  // Quand cet onglet devient actif, exposer sa webview au parent (webviewRef).
  useEffect(() => {
    if (active) onActiveWebviewRef.current?.(webviewRef.current);
  }, [active]);

  return (
    <webview
      // key gérée par le parent (tabId+partition). ref natif pour cet onglet.
      ref={webviewRef}
      src={initialUrl}
      partition={partition}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        // Onglet inactif : masqué mais TOUJOURS monté (reste chargé).
        visibility: active ? 'visible' : 'hidden',
        zIndex: active ? 1 : 0,
      }}
    />
  );
}
