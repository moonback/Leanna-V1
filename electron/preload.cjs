const { contextBridge, ipcRenderer } = require('electron');

// Expose uniquement les IPC handlers nécessaires au renderer
// nodeIntegration est désactivé — le renderer ne peut pas appeler require() directement
contextBridge.exposeInMainWorld('electronAPI', {
  folderContents: (folderPath) =>
    ipcRenderer.invoke('electron/folder-contents', folderPath),

  createFile: (folderPath, fileName) =>
    ipcRenderer.invoke('electron/create-file', folderPath, fileName),

  createFolder: (folderPath, folderName) =>
    ipcRenderer.invoke('electron/create-folder', folderPath, folderName),

  deletePath: (targetPath) =>
    ipcRenderer.invoke('electron/delete-path', targetPath),

  openPath: (targetPath) =>
    ipcRenderer.invoke('electron/open-path', targetPath),

  openExternal: (url) =>
    ipcRenderer.invoke('electron/open-external', url),

  getProjectRoot: () =>
    ipcRenderer.invoke('electron/get-project-root'),

  selectFolder: () =>
    ipcRenderer.invoke('electron/select-folder'),

  getScreenSources: () =>
    ipcRenderer.invoke('electron/get-screen-sources'),

  quit: () =>
    ipcRenderer.invoke('electron/quit'),

  // Clone un dépôt git distant dans un dossier local.
  // repoUrl  : URL HTTPS ou SSH du dépôt (ex: https://github.com/user/repo.git)
  // targetDir: dossier parent optionnel (défaut: ~/Documents/Leanna-Projects)
  // Retourne : { success: boolean, path?: string, repoName?: string, error?: string }
  gitClone: (repoUrl, targetDir) =>
    ipcRenderer.invoke('electron/git-clone', repoUrl, targetDir),

  // ── Extensions Chromium du navigateur intégré ───────────────────────────────
  // partition : la partition de session du profil actif (ex: persist:browser-default)
  // Retournent toutes : { success: boolean, ... , error?: string }

  // Liste les extensions chargées pour une partition.
  browserExtensionsList: (partition) =>
    ipcRenderer.invoke('electron/browser-extensions-list', partition),

  // Charge une extension décompressée. Si extPath est omis, ouvre un sélecteur de dossier.
  browserExtensionsLoad: (partition, extPath) =>
    ipcRenderer.invoke('electron/browser-extensions-load', partition, extPath),

  // Retire une extension par son identifiant.
  browserExtensionsRemove: (partition, extensionId) =>
    ipcRenderer.invoke('electron/browser-extensions-remove', partition, extensionId),
});

// ── Relais main → renderer : ouverture d'URL (popup/target=_blank refusé) ─────
// Le main refuse les popups (setWindowOpenHandler) et renvoie l'URL ici ; on la
// rediffuse en CustomEvent pour que le navigateur intégré l'ouvre dans un onglet.
ipcRenderer.on('browser-open-url', (_event, url) => {
  try {
    window.dispatchEvent(new CustomEvent('Leanna-browser-open-url', { detail: { url } }));
  } catch { /* noop */ }
});
