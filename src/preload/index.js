import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  loadData: () => ipcRenderer.invoke('load-data'),
  saveData: (data) => ipcRenderer.invoke('save-data', data),
  loadSettings: () => ipcRenderer.invoke('load-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  getSuggestedBaseDir: () => ipcRenderer.invoke('get-suggested-base-dir'),
  createBaseDir: (opts) => ipcRenderer.invoke('create-base-dir', opts),
  openFolder: (path) => ipcRenderer.invoke('open-folder', path),
  fetchFabricVersions: () => ipcRenderer.invoke('fetch-fabric-versions'),
  installFabric: (opts) => ipcRenderer.invoke('install-fabric', opts),
  startServer: (opts) => ipcRenderer.invoke('start-server', opts),
  stopServer: (opts) => ipcRenderer.invoke('stop-server', opts),
  sendCommand: (opts) => ipcRenderer.invoke('send-command', opts),
  fetchGlobalIp: () => ipcRenderer.invoke('fetch-global-ip'),
  onInstallLog: (cb) => { const h = (_, msg) => cb(msg); ipcRenderer.on('install-log', h); return () => ipcRenderer.removeListener('install-log', h) },
  onServerLog: (serverId, cb) => { const h = (_, msg) => cb(msg); ipcRenderer.on(`log-${serverId}`, h); return () => ipcRenderer.removeListener(`log-${serverId}`, h) },
  onServerStopped: (serverId, cb) => { const h = () => cb(); ipcRenderer.on(`stopped-${serverId}`, h); return () => ipcRenderer.removeListener(`stopped-${serverId}`, h) },
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
  deleteServerDir: (opts) => ipcRenderer.invoke('delete-server-dir', opts),
  deleteClusterDir: (opts) => ipcRenderer.invoke('delete-cluster-dir', opts),
  createClusterDir: (opts) => ipcRenderer.invoke('create-cluster-dir', opts),
  installVelocity: (opts) => ipcRenderer.invoke('install-velocity', opts),
  onVelocityLog: (cb) => { const h = (_, msg) => cb(msg); ipcRenderer.on('velocity-log', h); return () => ipcRenderer.removeListener('velocity-log', h) },
  startVelocity: (opts) => ipcRenderer.invoke('start-velocity', opts),
  stopVelocity: (opts) => ipcRenderer.invoke('stop-velocity', opts),
  onVelocityStarted: (clusterId, cb) => { const h = () => cb(); ipcRenderer.on(`velocity-started-${clusterId}`, h); return () => ipcRenderer.removeListener(`velocity-started-${clusterId}`, h) },
  onVelocityStopped: (clusterId, cb) => { const h = () => cb(); ipcRenderer.on(`velocity-stopped-${clusterId}`, h); return () => ipcRenderer.removeListener(`velocity-stopped-${clusterId}`, h) },
  onVelocityRunLog: (clusterId, cb) => { const h = (_, msg) => cb(msg); ipcRenderer.on(`velocity-log-${clusterId}`, h); return () => ipcRenderer.removeListener(`velocity-log-${clusterId}`, h) },
  onServerStarted: (serverId, cb) => { const h = () => cb(); ipcRenderer.on(`started-${serverId}`, h); return () => ipcRenderer.removeListener(`started-${serverId}`, h) },
  readServerProperties: (opts) => ipcRenderer.invoke('read-server-properties', opts),
  writeServerProperties: (opts) => ipcRenderer.invoke('write-server-properties', opts),
  writeVelocityToml: (opts) => ipcRenderer.invoke('write-velocity-toml', opts),
  setupFabricProxy: (opts) => ipcRenderer.invoke('setup-fabric-proxy', opts),
  scanClusterDir: (opts) => ipcRenderer.invoke('scan-cluster-dir', opts),
  scanServerDir: (opts) => ipcRenderer.invoke('scan-server-dir', opts),
  fetchPaperVersions: () => ipcRenderer.invoke('fetch-paper-versions'),
  installPaper: (opts) => ipcRenderer.invoke('install-paper', opts),
  setupPaperProxy: (opts) => ipcRenderer.invoke('setup-paper-proxy', opts),
  getLibraryStructure: (opts) => ipcRenderer.invoke('get-library-structure', opts),
  addLibraryItem: (opts) => ipcRenderer.invoke('add-library-item', opts),
  removeLibraryItem: (opts) => ipcRenderer.invoke('remove-library-item', opts),
  addModSource: (opts) => ipcRenderer.invoke('add-mod-source', opts),
  removeModSource: (opts) => ipcRenderer.invoke('remove-mod-source', opts),
  checkPort: (opts) => ipcRenderer.invoke('check-port', opts),
  addPaperPluginSource: (opts) => ipcRenderer.invoke('add-paper-plugin-source', opts),
  removePaperPluginSource: (opts) => ipcRenderer.invoke('remove-paper-plugin-source', opts),
  addVelocityPluginSource: (opts) => ipcRenderer.invoke('add-velocity-plugin-source', opts),
  removeVelocityPluginSource: (opts) => ipcRenderer.invoke('remove-velocity-plugin-source', opts),
  applyServerMods: (opts) => ipcRenderer.invoke('apply-server-mods', opts),
  applyServerPlugins: (opts) => ipcRenderer.invoke('apply-server-plugins', opts),
  selectFile: () => ipcRenderer.invoke('select-file'),
  selectJavaExe: () => ipcRenderer.invoke('select-java-exe'),
  deleteJavaInstallation: (opts) => ipcRenderer.invoke('delete-java-installation', opts),
  watchLibrary: (opts) => ipcRenderer.invoke('watch-library', opts),
  unwatchLibrary: () => ipcRenderer.invoke('unwatch-library'),
  onLibraryChanged: (cb) => { const h = () => cb(); ipcRenderer.on('library-changed', h); return () => ipcRenderer.removeListener('library-changed', h) },
  copyServerProfile: (opts) => ipcRenderer.invoke('copy-server-profile', opts),
  deleteWorldData: (opts) => ipcRenderer.invoke('delete-world-data', opts),
  backupServer: (opts) => ipcRenderer.invoke('backup-server', opts),
  onServerRestarting: (serverId, cb) => { const h = () => cb(); ipcRenderer.on(`restarting-${serverId}`, h); return () => ipcRenderer.removeListener(`restarting-${serverId}`, h) },
  modrinthSearch: (opts) => ipcRenderer.invoke('modrinth-search', opts),
  modrinthVersions: (opts) => ipcRenderer.invoke('modrinth-versions', opts),
  modrinthDownload: (opts) => ipcRenderer.invoke('modrinth-download', opts),
  modrinthResolveFiles: (opts) => ipcRenderer.invoke('modrinth-resolve-files', opts),
  onModrinthDownloadProgress: (cb) => { const h = (_, info) => cb(info); ipcRenderer.on('modrinth-download-progress', h); return () => ipcRenderer.removeListener('modrinth-download-progress', h) },
  detectJava: () => ipcRenderer.invoke('detect-java'),
  validateJavaPath: (opts) => ipcRenderer.invoke('validate-java-path', opts),
  installJava: (opts) => ipcRenderer.invoke('install-java', opts),
  onJavaInstallLog: (cb) => { const h = (_, msg) => cb(msg); ipcRenderer.on('java-install-log', h); return () => ipcRenderer.removeListener('java-install-log', h) },
  onJavaInstallProgress: (cb) => { const h = (_, info) => cb(info); ipcRenderer.on('java-install-progress', h); return () => ipcRenderer.removeListener('java-install-progress', h) },
  onJavaInstallDone: (cb) => { const h = (_, info) => cb(info); ipcRenderer.on('java-install-done', h); return () => ipcRenderer.removeListener('java-install-done', h) },
  getOps: (opts) => ipcRenderer.invoke('get-ops', opts),
  setOps: (opts) => ipcRenderer.invoke('set-ops', opts),
  fetchUuid: (opts) => ipcRenderer.invoke('fetch-uuid', opts),
  listModConfigs: (opts) => ipcRenderer.invoke('list-mod-configs', opts),
  readConfigFile: (opts) => ipcRenderer.invoke('read-config-file', opts),
  writeConfigFile: (opts) => ipcRenderer.invoke('write-config-file', opts),
  onUpdateAvailable: (cb) => { const h = (_, info) => cb(info); ipcRenderer.on('update-available', h); return () => ipcRenderer.removeListener('update-available', h) },
  onUpdateDownloadProgress: (cb) => { const h = (_, info) => cb(info); ipcRenderer.on('update-download-progress', h); return () => ipcRenderer.removeListener('update-download-progress', h) },
  onUpdateDownloaded: (cb) => { const h = (_, info) => cb(info); ipcRenderer.on('update-downloaded', h); return () => ipcRenderer.removeListener('update-downloaded', h) },
  onUpdateError: (cb) => { const h = (_, info) => cb(info); ipcRenderer.on('update-error', h); return () => ipcRenderer.removeListener('update-error', h) },
  installUpdate: () => ipcRenderer.invoke('install-update'),

  // ─── MariaDB ──────────────────────────────────────────────────────────────
  dbInstall: (opts) => ipcRenderer.invoke('db-install', opts),
  dbStart: (opts) => ipcRenderer.invoke('db-start', opts),
  dbStop: () => ipcRenderer.invoke('db-stop'),
  dbStatus: () => ipcRenderer.invoke('db-status'),
  dbCheckInstall: (opts) => ipcRenderer.invoke('db-check-install', opts),
  dbCreateSchema: (opts) => ipcRenderer.invoke('db-create-schema', opts),
  dbDelete: (opts) => ipcRenderer.invoke('db-delete', opts),
  dbGetSettings: () => ipcRenderer.invoke('db-get-settings'),
  dbGetVersion: () => ipcRenderer.invoke('db-get-version'),
  onDbInstallLog: (cb) => { const h = (_, msg) => cb(msg); ipcRenderer.on('db-install-log', h); return () => ipcRenderer.removeListener('db-install-log', h) },
  onDbInstallProgress: (cb) => { const h = (_, info) => cb(info); ipcRenderer.on('db-install-progress', h); return () => ipcRenderer.removeListener('db-install-progress', h) },
  onDbInstallDone: (cb) => { const h = (_, info) => cb(info); ipcRenderer.on('db-install-done', h); return () => ipcRenderer.removeListener('db-install-done', h) },
  onDbStatusChanged: (cb) => { const h = (_, info) => cb(info); ipcRenderer.on('db-status-changed', h); return () => ipcRenderer.removeListener('db-status-changed', h) },

  // ─── Diagnostics ─────────────────────────────────────────────────────────
  getLocalIp: () => ipcRenderer.invoke('get-local-ip'),
  diagUpnpOpenPort: (opts) => ipcRenderer.invoke('diag-upnp-open-port', opts),
  diagUpnpClosePort: (opts) => ipcRenderer.invoke('diag-upnp-close-port', opts),
  diagUpnpListMapped: () => ipcRenderer.invoke('diag-upnp-list-mapped'),
  diagUpnpCheck: () => ipcRenderer.invoke('diag-upnp-check'),
  diagCheckPortExternal: (opts) => ipcRenderer.invoke('diag-check-port-external', opts),
  checkInternetSpeed: () => ipcRenderer.invoke('check-internet-speed'),
  getAllServerPorts: () => ipcRenderer.invoke('get-all-server-ports'),

  // ─── 必須Mod / ライブラリ ───────────────────────────────────────────────
  checkRequiredMods: (opts) => ipcRenderer.invoke('check-required-mods', opts),
  repairRequiredMods: (opts) => ipcRenderer.invoke('repair-required-mods', opts),
  ensureModSourceFolder: (opts) => ipcRenderer.invoke('ensure-mod-source-folder', opts),

  // ─── Invsync ─────────────────────────────────────────────────────────────
  invsyncListVersions: () => ipcRenderer.invoke('invsync-list-versions'),
  invsyncInstall: (opts) => ipcRenderer.invoke('invsync-install', opts),
  invsyncUninstall: (opts) => ipcRenderer.invoke('invsync-uninstall', opts),
  invsyncCheck: (opts) => ipcRenderer.invoke('invsync-check', opts),

  // ─── パフォーマンス統計 ──────────────────────────────────────────────────
  getProcessStats: (serverIds) => ipcRenderer.invoke('get-process-stats', { serverIds }),
  getDirSize: (dir) => ipcRenderer.invoke('get-dir-size', { dir }),

  // ─── アプリ制御 ──────────────────────────────────────────────────────────
  restartApp: () => ipcRenderer.invoke('restart-app'),

  // ─── バージョン情報 ──────────────────────────────────────────────────────
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  fetchVelocityLatest: () => ipcRenderer.invoke('fetch-velocity-latest'),
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  window.electron = electronAPI
  window.api = api
}