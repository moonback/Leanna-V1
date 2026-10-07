const { app, BrowserWindow, systemPreferences, Notification, ipcMain, shell, dialog, desktopCapturer, nativeTheme, Tray, Menu } = require('electron');
nativeTheme.themeSource = 'dark';

const fs = require('fs');
const path = require('path');

const DEBUG = process.env.ELECTRON_DEBUG === '1';
const isPackaged = app.isPackaged;

function getWindowIcon() {
  const iconName = nativeTheme.shouldUseDarkColors ? 'icon-sombre.png' : 'icon-light.png';
  return path.join(__dirname, '../assets/images', iconName);
}

// --- Logging vers fichier, visible même sans terminal ---
const logPath = path.join(app.getPath('userData'), 'Leanna-debug.log');
function log(...args) {
  const line = `[${new Date().toISOString()}] ${args.join(' ')}`;
  console.log(line);
  try { fs.appendFileSync(logPath, line + '\n'); } catch (_) {}
}

process.on('uncaughtException', (err) => {
  log('UNCAUGHT EXCEPTION:', err.stack || err.message);
  dialog.showErrorBox('Erreur Leanna ', String(err.stack || err));
});

process.on('unhandledRejection', (err) => {
  log('UNHANDLED REJECTION:', err && err.stack ? err.stack : String(err));
});

log('App starting. isPackaged =', isPackaged, 'appPath =', app.getAppPath());

function startBackendServer() {
  try {
    process.env.NODE_ENV = 'production';
    process.env.ELECTRON_APP_PATH = app.getAppPath();
    // Dossier persistant pour les fichiers de config (.env, .gemini-keys.json, etc.)
    const configDir = app.getPath('userData');
    process.env.Leanna_CONFIG_PATH = configDir;
    log('Config directory:', configDir);

    // Initialiser le fichier .env utilisateur dans userData à partir du template .env.example si absent.
    // Si le fichier existe déjà, on s'assure que les clés présentes dans .env.example
    // mais absentes du fichier utilisateur sont ajoutées (migration forward-only).
    const destEnv = path.join(configDir, '.env');
    const exampleEnv = path.join(app.getAppPath(), '.env.example');
    if (!fs.existsSync(destEnv) && fs.existsSync(exampleEnv)) {
      try {
        fs.copyFileSync(exampleEnv, destEnv);
        log('Initialized user .env from .env.example in userData');
      } catch (e) {
        log('Failed to initialize .env from .env.example:', e.message);
      }
    } else if (fs.existsSync(destEnv) && fs.existsSync(exampleEnv)) {
      // Migration : ajouter les clés manquantes sans écraser les valeurs existantes
      try {
        const existing = fs.readFileSync(destEnv, 'utf-8');
        const example = fs.readFileSync(exampleEnv, 'utf-8');
        // Extraire les noms de clés déjà présents dans le fichier utilisateur
        const existingKeys = new Set(
          existing.split('\n')
            .map(l => l.match(/^([A-Za-z_][A-Za-z0-9_]*)=/)?.[1])
            .filter(Boolean)
        );
        // Collecter les lignes de .env.example dont la clé est absente
        // (regex insensible à la casse : couvre Leanna_*, VITE_* avec minuscules)
        const linesToAdd = example.split('\n').filter(line => {
          const key = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/)?.[1];
          return key && !existingKeys.has(key);
        });
        if (linesToAdd.length > 0) {
          const appendContent = '\n# --- Added by auto-migration ---\n' + linesToAdd.join('\n') + '\n';
          fs.appendFileSync(destEnv, appendContent, 'utf-8');
          log('Migrated', linesToAdd.length, 'missing keys into user .env');
        }
      } catch (e) {
        log('Failed to migrate user .env:', e.message);
      }
    }

    const serverPath = path.join(app.getAppPath(), 'dist', 'server.cjs');
    log('Loading server from:', serverPath, 'exists:', fs.existsSync(serverPath));
    require(serverPath);
    log('Server module required successfully');
  } catch (err) {
    log('SERVER START FAILED:', err.stack || err.message);
    dialog.showErrorBox('Erreur démarrage serveur', String(err.stack || err));
  }
}

// ── Splash Screen ───────────────────────────────────────────────────────────

function createSplashWindow() {
  const splash = new BrowserWindow({
    fullscreen: true,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    icon: getWindowIcon(),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  splash.loadFile(path.join(__dirname, 'splash.html'));
  return splash;
}

// ── Main Window ─────────────────────────────────────────────────────────────

function createWindow(splash, splashMinEnd) {
  const win = new BrowserWindow({
    width: DEBUG ? 1600 : 1200,
    height: 900,
    show: false, // Caché jusqu'à ce que le contenu soit prêt
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      // sandbox: false — corrige l'erreur d'init du renderer sandboxé
      // ("Cannot destructure property 'preloadScripts' of 'binding.startupData'
      // as it is null"). Le preload n'utilise que contextBridge/ipcRenderer et
      // n'a pas besoin du sandbox ; contextIsolation:true reste la barrière de
      // sécurité effective (le renderer n'a toujours pas accès à Node).
      sandbox: false,
      preload: path.join(__dirname, 'preload.cjs'),
      webviewTag: true,
    },
    autoHideMenuBar: !DEBUG,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#09090b',
    icon: getWindowIcon(),
  });

  win.maximize();

  const port = process.env.VITE_SERVER_PORT || 4000;
  const startUrl = process.env.ELECTRON_START_URL || `http://127.0.0.1:${port}`;
  log('Loading URL:', startUrl);
  win.loadURL(startUrl);

  // Afficher la fenêtre principale une fois le contenu chargé
  win.webContents.on('did-finish-load', () => {
    // Compléter la barre de progression sur le splash
    if (splash && !splash.isDestroyed()) {
      splash.webContents.executeJavaScript('if (typeof window.markComplete === "function") window.markComplete();').catch(() => {});
    }

    // Attendre la fin du cycle splash (minimum 4.5 secondes)
    const remaining = Math.max(400, (splashMinEnd || 0) - Date.now());
    setTimeout(() => {
      if (splash && !splash.isDestroyed()) {
        splash.close();
      }
      win.maximize();
      win.show();
      win.focus();
    }, remaining);
  });

  // Logger les messages de la console renderer dans le fichier de log
  win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    log(`[Renderer L${level}] ${message} (${sourceId}:${line})`);
  });

  // Raccourci F12 ou Ctrl+Shift+I pour ouvrir/fermer les DevTools
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i'))) {
      win.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  // Ouvrir les DevTools automatiquement en mode debug
  if (DEBUG) {
    win.webContents.openDevTools({ mode: 'right' });
    console.log('[Electron] Mode debug activé — DevTools ouverts');
  }

  win.webContents.on('did-fail-load', (_e, errorCode, errorDescription) => {
    log('FAILED TO LOAD:', errorCode, errorDescription);
    // Réessayer après 1.5s si le serveur n'est pas encore prêt
    if (errorCode === -102 || errorCode === -6 || errorCode === -105) {
      setTimeout(() => {
        log('Retrying load...');
        win.loadURL(startUrl);
      }, 1500);
    }
  });

  win.webContents.on('render-process-gone', (_e, details) => {
    log('RENDER PROCESS GONE:', JSON.stringify(details));
  });

  if (process.platform === 'darwin') {
    systemPreferences.askForMediaAccess('microphone');
    systemPreferences.askForMediaAccess('camera');
  }

  // ── Durcissement sécurité du <webview> du navigateur intégré ───────────────
  // Le navigateur intégré charge des pages web arbitraires. Sans gardes, Electron
  // accorderait par défaut caméra/micro/géoloc/notifications, autoriserait les
  // popups et les téléchargements silencieux. On verrouille tout cela.
  const { session: hardenSession } = require('electron');

  // Seules les partitions de profils navigateur sont autorisées sur le <webview>.
  const ALLOWED_WEBVIEW_PARTITION = /^persist:browser-[\w-]+$/;

  // Permissions refusées par défaut aux pages chargées dans le navigateur.
  const DENIED_WEBVIEW_PERMISSIONS = new Set([
    'media',            // caméra + micro
    'geolocation',
    'notifications',
    'midi',
    'midiSysex',
    'pointerLock',
    'fullscreen',       // laissé à false par prudence ; ajustable si besoin
    'openExternal',
    'hid',
    'serial',
    'usb',
  ]);

  // Mémorise les partitions déjà équipées d'un handler de permissions.
  const permissionGuardedPartitions = new Set();

  function guardPartitionPermissions(partition) {
    if (!partition || permissionGuardedPartitions.has(partition)) return;
    permissionGuardedPartitions.add(partition);
    try {
      const ses = hardenSession.fromPartition(partition);
      ses.setPermissionRequestHandler((_wc, permission, callback) => {
        callback(!DENIED_WEBVIEW_PERMISSIONS.has(permission));
      });
      ses.setPermissionCheckHandler((_wc, permission) => !DENIED_WEBVIEW_PERMISSIONS.has(permission));
      // Téléchargements : refusés par défaut dans le navigateur intégré.
      ses.on('will-download', (event) => {
        log('[webview] Téléchargement bloqué (non supporté dans le navigateur intégré).');
        event.preventDefault();
      });
    } catch (e) {
      log('[webview] Échec de pose des gardes de permission:', e.message);
    }
  }

  // Verrouille les webPreferences de chaque <webview> au moment de son attache.
  win.webContents.on('will-attach-webview', (event, webPreferences, params) => {
    // Pas de preload, pas d'intégration Node, isolation du contexte obligatoire.
    delete webPreferences.preload;
    delete webPreferences.preloadURL;
    webPreferences.nodeIntegration = false;
    webPreferences.nodeIntegrationInSubFrames = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
    webPreferences.webSecurity = true;
    webPreferences.allowRunningInsecureContent = false;

    // La partition doit être une partition de profil navigateur connue.
    if (!ALLOWED_WEBVIEW_PARTITION.test(params.partition || '')) {
      log('[webview] Partition refusée:', params.partition);
      event.preventDefault();
      return;
    }
    guardPartitionPermissions(params.partition);
  });

  // Certificats invalides : ne jamais passer outre dans le navigateur intégré.
  win.webContents.on('certificate-error', (event, _url, _error, _cert, callback) => {
    callback(false);
  });

  return win;
}

// ── System Tray ─────────────────────────────────────────────────────────────

let tray = null;

function createTray(win) {
  const iconPath = path.join(__dirname, '../assets/images/icon-sombre.png');
  tray = new Tray(iconPath);
  tray.setToolTip('Leanna');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Afficher',
      click: () => {
        win.show();
        win.focus();
      },
    },
    {
      label: 'Masquer',
      click: () => {
        win.hide();
      },
    },
    { type: 'separator' },
    {
      label: 'Quitter',
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  // Double-clic sur l'icône tray → afficher/masquer la fenêtre
  tray.on('double-click', () => {
    if (win.isVisible()) {
      win.hide();
    } else {
      win.show();
      win.focus();
    }
  });
}

app.whenReady().then(() => {
  const splash = createSplashWindow();
  const splashMinEnd = Date.now() + 5000; // splash visible au moins 5 secondes

  // Démarrer le serveur backend en mode packagé
  if (isPackaged) {
    startBackendServer();
  }

  const win = createWindow(splash, splashMinEnd);

  // Durcissement : interdire aux pages du <webview> d'ouvrir des popups ou de
  // nouvelles fenêtres non contrôlées, et bloquer la navigation du shell lui-même.
  app.on('web-contents-created', (_event, contents) => {
    // Toute tentative d'ouverture de fenêtre (window.open, target=_blank) est refusée.
    contents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//i.test(url)) {
        // Relayer au renderer : il pourra proposer d'ouvrir dans un onglet/externe.
        try { win.webContents.send('browser-open-url', url); } catch (_) { /* noop */ }
      }
      return { action: 'deny' };
    });
    // Empêcher le shell principal (fenêtre React) de naviguer ailleurs que l'app.
    if (contents === win.webContents) {
      contents.on('will-navigate', (navEvent, navUrl) => {
        const startBase = process.env.ELECTRON_START_URL || `http://127.0.0.1:${process.env.VITE_SERVER_PORT || 4000}`;
        if (!navUrl.startsWith(startBase)) {
          navEvent.preventDefault();
        }
      });
    }
  });

  // Créer le tray une fois la fenêtre prête
  createTray(win);

  // Intercepter la fermeture : réduire dans le tray plutôt que quitter
  win.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      win.hide();
      if (Notification.isSupported()) {
        new Notification({
          title: 'Leanna',
          body: 'Leanna tourne en arrière-plan. Double-cliquez sur l\'icône pour rouvrir.',
        }).show();
      }
    }
  });

  // --- IPC Handlers (inchangé) ---

  ipcMain.handle('electron/folder-contents', async function (_event, folderPath) {
    const entries = await fs.promises.readdir(folderPath, { withFileTypes: true });
    return entries.map(function (entry) {
      return {
        name: entry.name,
        isDirectory: entry.isDirectory(),
        path: path.join(folderPath, entry.name),
      };
    });
  });

  ipcMain.handle('electron/create-file', async function (_event, folderPath, fileName) {
    const targetPath = path.join(folderPath, fileName);
    await fs.promises.writeFile(targetPath, '', { flag: 'wx' });
    return targetPath;
  });

  ipcMain.handle('electron/create-folder', async function (_event, folderPath, folderName) {
    const targetPath = path.join(folderPath, folderName);
    await fs.promises.mkdir(targetPath, { recursive: false });
    return targetPath;
  });

  ipcMain.handle('electron/delete-path', async function (_event, targetPath) {
    await fs.promises.rm(targetPath, { recursive: true, force: true });
    return true;
  });

  ipcMain.handle('electron/open-path', async function (_event, targetPath) {
    await shell.openPath(targetPath);
    return true;
  });

  ipcMain.handle('electron/open-external', async function (_event, url) {
    // Allowlist stricte : seuls http(s) et mailto sont ouverts dans le navigateur
    // par défaut du système. Bloque file:, les protocoles custom, javascript:, etc.
    if (typeof url !== 'string' || !url.trim()) {
      return { success: false, error: 'URL invalide.' };
    }
    let scheme;
    try {
      scheme = new URL(url).protocol.toLowerCase();
    } catch {
      return { success: false, error: 'URL malformée.' };
    }
    if (scheme !== 'http:' && scheme !== 'https:' && scheme !== 'mailto:') {
      log('[open-external] Schéma refusé:', scheme);
      return { success: false, error: `Schéma non autorisé : ${scheme}` };
    }
    await shell.openExternal(url);
    return { success: true };
  });

  ipcMain.handle('electron/get-project-root', async function () {
    // IDE : retourne toujours le dossier de l'app elle-même
    return process.env.ELECTRON_APP_PATH || app.getAppPath();
  });

  ipcMain.handle('electron/select-folder', async function () {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Choisir le workspace',
    });
    if (result.canceled || !result.filePaths.length) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('electron/quit', function () {
    app.isQuitting = true;
    app.quit();
  });

  // ── Git Clone ────────────────────────────────────────────────────────────────
  // Clone un dépôt GitHub (ou tout dépôt git) dans un dossier local,
  // puis retourne le chemin du dossier cloné pour activation comme workspace.
  ipcMain.handle('electron/git-clone', async function (_event, repoUrl, targetDir) {
    const { execFile } = require('child_process');
    const { promisify } = require('util');
    const os = require('os');

    const execFileAsync = promisify(execFile);

    // Sanitize: s'assurer que repoUrl est une string et commence par https://
    if (typeof repoUrl !== 'string' || !repoUrl.trim()) {
      return { success: false, error: 'URL de dépôt invalide.' };
    }
    const url = repoUrl.trim();
    if (!/^https?:\/\//i.test(url) && !/^git@/i.test(url)) {
      return { success: false, error: 'Seules les URLs HTTPS et SSH (git@) sont autorisées.' };
    }

    // Dériver le nom du dépôt depuis l'URL (ex: https://github.com/user/my-repo.git → my-repo)
    const repoName = url.split('/').pop()?.replace(/\.git$/i, '').replace(/[^a-zA-Z0-9_\-. ]/g, '_') || 'repo';

    // Dossier de destination : soit fourni par l'utilisateur, soit ~/Documents/Leanna-Projects/<repo>
    let clonePath;
    if (targetDir && typeof targetDir === 'string' && targetDir.trim()) {
      clonePath = path.resolve(targetDir.trim(), repoName);
    } else {
      clonePath = path.join(os.homedir(), 'Documents', 'Leanna-Projects', repoName);
    }

    // S'assurer que le dossier parent existe
    try {
      await fs.promises.mkdir(path.dirname(clonePath), { recursive: true });
    } catch (mkErr) {
      return { success: false, error: `Impossible de créer le dossier parent: ${mkErr.message}` };
    }

    // Vérifier que le dossier de destination n'existe pas déjà
    if (fs.existsSync(clonePath)) {
      return { success: false, error: `Le dossier de destination existe déjà: ${clonePath}`, clonePath };
    }

    try {
      await execFileAsync('git', ['clone', '--progress', url, clonePath], {
        timeout: 300000, // 5 minutes max
        windowsHide: true,
      });
      log(`[git-clone] Clone réussi: ${url} → ${clonePath}`);
      return { success: true, path: clonePath, repoName };
    } catch (err) {
      // execFile rejette avec l'objet Error qui contient stderr dans err.stderr
      const errMsg = (err.stderr || err.message || String(err)).trim();
      log(`[git-clone] Erreur: ${errMsg}`);
      // Nettoyer le dossier partiellement cloné si présent
      try { if (fs.existsSync(clonePath)) await fs.promises.rm(clonePath, { recursive: true, force: true }); } catch (_) {}
      return { success: false, error: errMsg };
    }
  });

  // ── Extensions Chromium (navigateur intégré) ─────────────────────────────────
  // Electron ne supporte qu'un sous-ensemble de l'API Chrome Extensions et
  // exige des extensions « décompressées » (dossier). Les extensions chargées
  // ne sont pas restaurées automatiquement entre deux lancements : on persiste
  // donc nous-mêmes la liste des chemins par partition dans userData, et on les
  // recharge à la première utilisation de la partition.
  const { session: electronSession } = require('electron');
  const extensionsStorePath = path.join(app.getPath('userData'), 'browser-extensions.json');
  // Partitions déjà réhydratées pendant cette session (évite les doubles chargements).
  const hydratedPartitions = new Set();

  function readExtensionsStore() {
    try {
      if (!fs.existsSync(extensionsStorePath)) return {};
      const raw = fs.readFileSync(extensionsStorePath, 'utf-8');
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
      log('[extensions] Lecture du store échouée:', e.message);
      return {};
    }
  }

  function writeExtensionsStore(store) {
    try {
      fs.writeFileSync(extensionsStorePath, JSON.stringify(store, null, 2), 'utf-8');
    } catch (e) {
      log('[extensions] Écriture du store échouée:', e.message);
    }
  }

  function isValidPartition(partition) {
    return typeof partition === 'string' && /^persist:browser-[\w-]+$/.test(partition);
  }

  function serializeExtension(ext) {
    return {
      id: ext.id,
      name: ext.name,
      version: ext.version,
      path: ext.path,
    };
  }

  // Recharge les extensions persistées pour une partition (une seule fois par session).
  async function hydratePartition(partition) {
    if (hydratedPartitions.has(partition)) return;
    hydratedPartitions.add(partition);
    const store = readExtensionsStore();
    const paths = Array.isArray(store[partition]) ? store[partition] : [];
    if (!paths.length) return;
    const ses = electronSession.fromPartition(partition);
    const stillValid = [];
    for (const extPath of paths) {
      try {
        if (!fs.existsSync(extPath)) {
          log('[extensions] Chemin introuvable, retiré du store:', extPath);
          continue;
        }
        await ses.extensions.loadExtension(extPath, { allowFileAccess: true });
        stillValid.push(extPath);
      } catch (e) {
        log('[extensions] Rechargement échoué pour', extPath, ':', e.message);
      }
    }
    // Nettoyer le store des chemins devenus invalides.
    if (stillValid.length !== paths.length) {
      store[partition] = stillValid;
      writeExtensionsStore(store);
    }
  }

  ipcMain.handle('electron/browser-extensions-list', async function (_event, partition) {
    if (!isValidPartition(partition)) return { success: false, error: 'Partition invalide.' };
    try {
      await hydratePartition(partition);
      const ses = electronSession.fromPartition(partition);
      const all = ses.extensions.getAllExtensions();
      return { success: true, extensions: all.map(serializeExtension) };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('electron/browser-extensions-load', async function (_event, partition, extPath) {
    if (!isValidPartition(partition)) return { success: false, error: 'Partition invalide.' };
    let targetPath = extPath;
    // Si aucun chemin fourni, ouvrir un sélecteur de dossier.
    if (!targetPath) {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory'],
        title: 'Choisir le dossier de l\'extension (décompressée)',
      });
      if (result.canceled || !result.filePaths.length) {
        return { success: false, canceled: true };
      }
      targetPath = result.filePaths[0];
    }
    if (typeof targetPath !== 'string' || !fs.existsSync(targetPath)) {
      return { success: false, error: 'Dossier d\'extension introuvable.' };
    }
    // Vérifier la présence d'un manifest.json (indice d'une extension décompressée).
    if (!fs.existsSync(path.join(targetPath, 'manifest.json'))) {
      return { success: false, error: 'Aucun manifest.json dans ce dossier — ce n\'est pas une extension décompressée.' };
    }
    try {
      await hydratePartition(partition);
      const ses = electronSession.fromPartition(partition);
      const ext = await ses.extensions.loadExtension(targetPath, { allowFileAccess: true });
      // Persister le chemin.
      const store = readExtensionsStore();
      const list = Array.isArray(store[partition]) ? store[partition] : [];
      if (!list.includes(targetPath)) list.push(targetPath);
      store[partition] = list;
      writeExtensionsStore(store);
      log('[extensions] Chargée:', ext.name, ext.version, 'sur', partition);
      return { success: true, extension: serializeExtension(ext) };
    } catch (e) {
      log('[extensions] Chargement échoué:', e.message);
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('electron/browser-extensions-remove', async function (_event, partition, extensionId) {
    if (!isValidPartition(partition)) return { success: false, error: 'Partition invalide.' };
    if (typeof extensionId !== 'string' || !extensionId) {
      return { success: false, error: 'Identifiant d\'extension invalide.' };
    }
    try {
      const ses = electronSession.fromPartition(partition);
      const existing = ses.extensions.getAllExtensions().find(function (e) { return e.id === extensionId; });
      const removedPath = existing ? existing.path : null;
      ses.extensions.removeExtension(extensionId);
      // Retirer le chemin du store.
      if (removedPath) {
        const store = readExtensionsStore();
        if (Array.isArray(store[partition])) {
          store[partition] = store[partition].filter(function (p) { return p !== removedPath; });
          writeExtensionsStore(store);
        }
      }
      log('[extensions] Retirée:', extensionId, 'de', partition);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('electron/get-screen-sources', async function () {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 320, height: 180 },
    });
    return sources.map(function (source) {
      return {
        id: source.id,
        name: source.name,
        thumbnail: source.thumbnail.toDataURL(),
      };
    });
  });

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(null, 0);
    } else {
      win.show();
      win.focus();
    }
  });

  if (Notification.isSupported()) {
    new Notification({ title: 'Leanna ', body: 'Système local connecté et prêt.' }).show();
  }
});

app.on('window-all-closed', function () {
  // Ne pas quitter si on réduit dans le tray
  if (app.isQuitting && process.platform !== 'darwin') {
    app.quit();
  }
});

// ── Graceful shutdown ────────────────────────────────────────────────────────
// Le serveur Express est chargé dans le même process (require(serverPath)).
// On utilise process.__LeannaShutdown (exposé par server.ts) pour déclencher
// l'arrêt propre des timers, sessions Gemini et WebSocket avant de quitter.
// Cela évite les MaxListenersExceededWarning et sessions zombies après
// plusieurs redémarrages en développement.

let isShuttingDown = false;

app.on('before-quit', function (event) {
  if (isShuttingDown) return; // Éviter les appels multiples
  isShuttingDown = true;

  const shutdown = process.__LeannaShutdown;

  // Mode packagé : le serveur tourne dans le même process → graceful shutdown
  if (typeof shutdown === 'function') {
    event.preventDefault();
    log('[Lifecycle] before-quit : déclenchement du graceful shutdown...');

    shutdown('before-quit').then(function () {
      log('[Lifecycle] Shutdown complet, fermeture Electron.');
    }).catch(function (err) {
      log('[Lifecycle] Erreur shutdown:', err && err.message ? err.message : String(err));
    }).finally(function () {
      killChildProcesses();
      app.exit(0);
    });

    // Sécurité : forcer la fermeture après 5s si le shutdown n'aboutit pas
    setTimeout(function () {
      log('[Lifecycle] Timeout shutdown (5s), forçage fermeture.');
      killChildProcesses();
      app.exit(0);
    }, 5000);

  } else {
    // Mode dev : le serveur est un process séparé lancé par concurrently.
    // On tue le process qui écoute sur le port du serveur avant de quitter.
    log('[Lifecycle] before-quit (dev) : arrêt du serveur dev sur le port...');
    killDevServer();
    // Pas de preventDefault() — Electron peut se fermer immédiatement
  }
});

// Tue le serveur dev (process séparé lancé par concurrently en mode dev).
// Cherche le PID qui écoute sur le port du serveur et le termine.
function killDevServer() {
  const port = process.env.VITE_SERVER_PORT || '4000';
  try {
    const { execSync } = require('child_process');
    if (process.platform === 'win32') {
      // netstat donne le PID pour le port donné
      const output = execSync(
        'netstat -ano | findstr :' + port + ' | findstr LISTENING',
        { encoding: 'utf-8', windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] }
      ).trim();
      // Extraire le dernier token (PID) de la première ligne
      const firstLine = output.split('\n')[0];
      const pid = firstLine && firstLine.trim().split(/\s+/).pop();
      if (pid && /^\d+$/.test(pid) && parseInt(pid) !== process.pid) {
        log('[Lifecycle] Arrêt serveur dev PID:', pid, 'port:', port);
        execSync('taskkill /PID ' + pid + ' /T /F', { stdio: 'ignore', windowsHide: true });
      }
    } else {
      // Linux/macOS : lsof
      const output = execSync(
        'lsof -ti tcp:' + port,
        { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }
      ).trim();
      output.split('\n').forEach(function (pid) {
        pid = pid.trim();
        if (pid && /^\d+$/.test(pid) && parseInt(pid) !== process.pid) {
          log('[Lifecycle] Arrêt serveur dev PID:', pid, 'port:', port);
          try { process.kill(parseInt(pid), 'SIGTERM'); } catch (_) {}
        }
      });
    }
  } catch (_) {
    // Pas de process sur ce port, ou commande indisponible — on continue
  }
}

// Sur Windows, app.exit() ne tue pas toujours les child processes (MCP, etc.)
// On utilise taskkill pour nettoyer l'arbre de processus.
function killChildProcesses() {
  if (process.platform !== 'win32') return;
  try {
    const { execSync } = require('child_process');
    const pid = process.pid;
    log('[Lifecycle] Nettoyage processus enfants (PID parent:', pid, ')...');
    // /T = kill process tree, /F = force
    execSync('taskkill /PID ' + pid + ' /T /F', {
      stdio: 'ignore',
      windowsHide: true,
    });
  } catch (_) {
    // Erreur attendue : taskkill échoue quand le process est déjà en train de mourir
  }
}

