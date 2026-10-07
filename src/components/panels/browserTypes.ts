/** Electron webview types used by the browser panel. */
export interface WebviewElement extends HTMLElement {
  src: string;
  loadURL(url: string): void;
  reload(): void;
  stop(): void;
  goBack(): void;
  goForward(): void;
  canGoBack(): boolean;
  canGoForward(): boolean;
  getURL(): string;
  getTitle(): string;
  executeJavaScript(code: string): Promise<unknown>;
  /** Capture le rendu courant du webview. Renvoie un NativeImage Electron. */
  capturePage(): Promise<{
    toDataURL(): string;
    toPNG(): { toString(encoding: string): string };
    isEmpty(): boolean;
  }>;
  /** Zoom (niveau 0 = 100 %, +0.5 ≈ +50 %). */
  setZoomLevel(level: number): void;
  getZoomLevel(): number;
  /** Recherche dans la page. */
  findInPage(text: string, options?: { forward?: boolean; findNext?: boolean }): number;
  stopFindInPage(action: 'clearSelection' | 'keepSelection' | 'activateSelection'): void;
  /** Outils de développement de la page. */
  openDevTools(): void;
  closeDevTools(): void;
  isDevToolsOpened(): boolean;
}

export interface WebviewFaviconEvent extends Event {
  favicons: string[];
}

export interface WebviewFoundInPageEvent extends Event {
  result: {
    requestId: number;
    activeMatchOrdinal: number;
    matches: number;
    finalUpdate: boolean;
  };
}

export interface WebviewTitleEvent extends Event {
  title: string;
  explicitSet: boolean;
}

export interface WebviewFailLoadEvent extends Event {
  errorCode: number;
  errorDescription: string;
  validatedURL: string;
  isMainFrame: boolean;
}

export interface WebviewNavigateEvent extends Event {
  url: string;
  httpResponseCode: number;
  httpStatusText: string;
  isMainFrame?: boolean;
}

export interface BrowserPanelProps {
  onClose: () => void;
  url?: string;
  defaultUrl?: string;
  fullWidth?: boolean;
  width?: string;
  onOpenInNewTab?: (url: string) => void;
  onOpenExternal?: () => void;
}
