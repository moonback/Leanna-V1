/** Extension Chromium chargée dans le navigateur intégré. */
export interface BrowserExtensionInfo {
  id: string;
  name: string;
  version: string;
  path: string;
}

export interface BrowserExtensionsListResult {
  success: boolean;
  extensions?: BrowserExtensionInfo[];
  error?: string;
}

export interface BrowserExtensionsLoadResult {
  success: boolean;
  extension?: BrowserExtensionInfo;
  canceled?: boolean;
  error?: string;
}

export interface BrowserExtensionsRemoveResult {
  success: boolean;
  error?: string;
}

export interface ElectronAPI {
  folderContents: (folderPath: string) => Promise<Array<{ name: string; path: string; isDirectory: boolean }>>;
  createFile: (folderPath: string, fileName: string) => Promise<string>;
  createFolder: (folderPath: string, folderName: string) => Promise<string>;
  deletePath: (targetPath: string) => Promise<boolean>;
  openPath: (targetPath: string) => Promise<boolean>;
  /** Ouvre une URL dans le navigateur par défaut (allowlist http/https/mailto côté main). */
  openExternal?: (url: string) => Promise<{ success: boolean; error?: string }>;
  getProjectRoot: () => Promise<string>;
  quit: () => Promise<void>;
  /** Liste les extensions chargées pour une partition de session. */
  browserExtensionsList?: (partition: string) => Promise<BrowserExtensionsListResult>;
  /** Charge une extension décompressée (ouvre un sélecteur de dossier si extPath omis). */
  browserExtensionsLoad?: (partition: string, extPath?: string) => Promise<BrowserExtensionsLoadResult>;
  /** Retire une extension par son identifiant. */
  browserExtensionsRemove?: (partition: string, extensionId: string) => Promise<BrowserExtensionsRemoveResult>;
}

declare global {
  interface Window {
    electron?: ElectronAPI;    // ancien nom — conservé pour compatibilité
    electronAPI?: ElectronAPI; // nouveau nom exposé par le preload
  }
}

export {};
