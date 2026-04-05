import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { autoUpdater } from 'electron-updater'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, readdirSync, unlinkSync, copyFileSync, watch, statSync } from 'fs'
import { spawn } from 'child_process'
import { createConnection } from 'net'
import icon from '../../resources/icon.png?asset'
import {
  DB_DIR_NAME as _DB_DIR_NAME,
  detectServerType,
  detectFabricMcVersion,
  detectPaperMcVersion,
  getDbDirs,
  resolveServerName
} from './utils.js'

// ─── MariaDB globals ─────────────────────────────────────────────────────────
let dbProcess = null
let dbStartPromise = null  // 同時起動を防ぐ共有 Promise
let dbLastError = null     // 最後の起動エラー（Settings が後からポーリングしても取得できるよう保持）
const DB_DIR_NAME = _DB_DIR_NAME

// TCP でポートが実際に開いているか確認するヘルパー
function checkDbPortOpen(port = 3306) {
  return new Promise(resolve => {
    const sock = createConnection({ host: '127.0.0.1', port }, () => {
      sock.destroy()
      resolve(true)
    })
    sock.on('error', () => resolve(false))
    sock.setTimeout(800, () => { sock.destroy(); resolve(false) })
  })
}

// MariaDB を起動して TCP ポートが開くまで待つ共有ヘルパー
// 複数箇所から同時に呼ばれても 1 つの起動処理に統合される
function doStartDb(db, baseDir) {
  if (dbStartPromise) return dbStartPromise

  dbStartPromise = (async () => {
    try {
      const port = db.port || 3306

      // 既に起動している場合はそのまま返す
      if (await checkDbPortOpen(port)) {
        dbLastError = null
        mainWindow?.webContents.send('db-status-changed', { running: true, error: null })
        return { success: true, alreadyRunning: true }
      }

      // 実行ファイルの特定
      const { dataDir: defaultDataDir, mysqldExe } = getDbDirs(baseDir || '')
      const binDir = db.binDir || join(baseDir || '', DB_DIR_NAME, 'mariadb', 'bin')
      const exe = existsSync(mysqldExe) ? mysqldExe : join(binDir, 'mysqld.exe')
      if (!existsSync(exe)) {
        const err = `mysqld.exe が見つかりません (探索パス: ${join(binDir, 'mysqld.exe')})`
        dbLastError = err
        mainWindow?.webContents.send('db-status-changed', { running: false, error: err })
        return { success: false, error: err }
      }

      const proc = spawn(exe, [
        `--datadir=${db.dataDir || defaultDataDir}`,
        `--port=${port}`,
        '--bind-address=127.0.0.1',
        '--console'
      ], { cwd: binDir })

      // stdout/stderr を消費しつつ末尾 500 文字を保持（エラー診断用）
      let stderrTail = ''
      proc.stdout?.setEncoding('utf8'); proc.stderr?.setEncoding('utf8')
      proc.stdout?.resume()
      proc.stderr?.on('data', d => { stderrTail = (stderrTail + d).slice(-500) })

      proc.on('close', () => {
        if (dbProcess === proc) {
          dbProcess = null
          mainWindow?.webContents.send('db-status-changed', { running: false })
        }
      })
      proc.on('error', (e) => {
        if (dbProcess === proc) dbProcess = null
        mainWindow?.webContents.send('db-status-changed', { running: false, error: e.message })
      })

      // TCP ポーリングで実際に接続できるまで待つ（最大 30 秒）
      const deadline = Date.now() + 30000
      while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 500))
        if (await checkDbPortOpen(port)) {
          dbProcess = proc
          dbLastError = null
          // 起動成功後、パスワードが未設定の場合は自動で設定する
          if (db.password) {
            try {
              const mysql = require('mysql2/promise')
              // まず空パスワードで接続を試みる（初期化直後など未設定の場合）
              const testConn = await mysql.createConnection({ host: '127.0.0.1', port, user: 'root', password: '' })
              await testConn.execute(`ALTER USER 'root'@'localhost' IDENTIFIED BY ?`, [db.password])
              await testConn.execute('FLUSH PRIVILEGES')
              await testConn.end()
            } catch { /* 既にパスワードが設定済みの場合は無視 */ }
          }
          mainWindow?.webContents.send('db-status-changed', { running: true, error: null })
          return { success: true }
        }
        if (proc.exitCode !== null) {
          const hint = stderrTail.split('\n').filter(l => l.includes('[ERROR]') || l.includes('error')).slice(-2).join(' ').trim()
          const errMsg = hint ? `mysqld 終了 (code: ${proc.exitCode}) — ${hint}` : `mysqld が終了しました (code: ${proc.exitCode})`
          dbLastError = errMsg
          mainWindow?.webContents.send('db-status-changed', { running: false, error: errMsg })
          return { success: false, error: errMsg }
        }
      }

      try { proc.kill() } catch { /* ignore */ }
      const timeoutMsg = '起動タイムアウト（30秒）'
      dbLastError = timeoutMsg
      mainWindow?.webContents.send('db-status-changed', { running: false, error: timeoutMsg })
      return { success: false, error: timeoutMsg }
    } finally {
      dbStartPromise = null
    }
  })()

  return dbStartPromise
}

const DATA_PATH = join(app.getPath('userData'), 'servers.json')
const SETTINGS_PATH = join(app.getPath('userData'), 'settings.json')
const PID_PATH = join(app.getPath('userData'), 'pids.json')

const DEFAULT_DATA = {
  clusters: [],
  standalone: [],
  modSources: [],
  paperPluginSources: [],
  velocityPluginSources: []
}
const DEFAULT_SETTINGS = { baseDir: '' }

function loadData() {
  if (!existsSync(DATA_PATH)) return DEFAULT_DATA
  try { return JSON.parse(readFileSync(DATA_PATH, 'utf-8')) } catch { return DEFAULT_DATA }
}

function saveData(data) {
  writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), 'utf-8')
}

function loadSettings() {
  if (!existsSync(SETTINGS_PATH)) return DEFAULT_SETTINGS
  try { return JSON.parse(readFileSync(SETTINGS_PATH, 'utf-8')) } catch { return DEFAULT_SETTINGS }
}

function saveSettings(settings) {
  writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf-8')
}

function loadPids() {
  if (!existsSync(PID_PATH)) return {}
  try { return JSON.parse(readFileSync(PID_PATH, 'utf-8')) } catch { return {} }
}

function savePids(pids) {
  writeFileSync(PID_PATH, JSON.stringify(pids, null, 2), 'utf-8')
}

const processes = {}
const serverSpawnOpts = {}
const manualStops = new Set()
let mainWindow = null

// detectServerType / detectFabricMcVersion / detectPaperMcVersion は utils.js から import

function writeVoidWorldConfigs(serverDir) {
  const configDir = join(serverDir, 'config')
  if (!existsSync(configDir)) mkdirSync(configDir, { recursive: true })

  const spigotYml = `settings:
  debug: false
  bungeecord: false
  save-user-cache-on-stop-only: false
  sample-count: 12
  timeout-time: 60
  restart-on-crash: true
  restart-script: ./start.sh
  log-villager-deaths: false
  log-named-deaths: false
  user-cache-size: 1000
  attribute:
    maxAbsorption:
      max: 2048.0
    maxHealth:
      max: 1024.0
    movementSpeed:
      max: 1024.0
    attackDamage:
      max: 2048.0
  netty-threads: 4
  player-shuffle: 0
  moved-too-quickly-multiplier: 10.0
  moved-wrongly-threshold: 0.0625
messages:
  whitelist: You are not whitelisted on this server!
  unknown-command: Unknown command. Type "/help" for help.
  server-full: The server is full!
  outdated-client: Outdated client! Please use {0}
  outdated-server: Outdated server! I'm still on {0}
  restart: Server is restarting
advancements:
  disable-saving: true
  disabled:
  - minecraft:story/disabled
world-settings:
  default:
    nerf-spawner-mobs: true
    view-distance: 2
    simulation-distance: 2
    mob-spawn-range: 0
    item-despawn-rate: 100
    merge-radius:
      exp: 6.0
      item: 4.0
    hunger:
      jump-walk-exhaustion: 0.0
      jump-sprint-exhaustion: 0.0
      combat-exhaustion: 0.0
      regen-exhaustion: 0.0
      swim-multiplier: 0.0
      sprint-multiplier: 0.0
      other-multiplier: 0.0
    ticks-per:
      hopper-transfer: 9999
      hopper-check: 9999
    hopper-amount: 1
    hopper-can-load-chunks: false
    zombie-aggressive-towards-villager: false
    enable-zombie-pigmen-portal-spawns: false
    max-tnt-per-tick: 0
    entity-activation-range:
      animals: 0
      monsters: 0
      raiders: 0
      misc: 0
      water: 0
      villagers: 0
      flying-monsters: 0
    entity-tracking-range:
      players: 32
      animals: 0
      monsters: 0
      misc: 0
      display: 0
      other: 0
players:
  disable-saving: false
config-version: 12
commands:
  spam-exclusions:
  - /skill
  replace-commands:
  - setblock
  - summon
  - testforblock
  - tellraw
  tab-complete: 0
  send-namespaced: true
  log: true
  silent-commandblock-console: false
  enable-spam-exclusions: false
stats:
  disable-saving: true
  forced-stats: {}
`

  const bukkitYml = `settings:
  allow-end: false
  warn-on-overload: true
  permissions-file: permissions.yml
  update-folder: update
  plugin-profiling: false
  connection-throttle: 4000
  query-plugins: true
  deprecated-verbose: default
  shutdown-message: Server closed
  minimum-api: none
  use-map-color-cache: true
spawn-limits:
  monsters: 0
  animals: 0
  water-animals: 0
  water-ambient: 0
  water-underground-creature: 0
  axolotls: 0
  ambient: 0
chunk-gc:
  period-in-ticks: 200
ticks-per:
  animal-spawns: 9999
  monster-spawns: 9999
  water-spawns: 9999
  water-ambient-spawns: 9999
  water-underground-creature-spawns: 9999
  axolotl-spawns: 9999
  ambient-spawns: 9999
  autosave: 12000
aliases: now-in-commands.yml
`

  const paperGlobalYml = `_version: 31
block-updates:
  disable-chorus-plant-updates: true
  disable-mushroom-block-updates: true
  disable-noteblock-updates: true
  disable-tripwire-updates: true
console:
  enable-brigadier-completions: true
  enable-brigadier-highlighting: true
  has-all-permissions: false
logging:
  deobfuscate-stacktraces: true
misc:
  compression-level: default
  enable-nether: false
  fix-far-end-terrain-generation: false
  load-permissions-yml-before-plugins: true
  max-joins-per-tick: 10
  prevent-negative-villager-demand: false
  region-file-cache-size: 64
  send-full-pos-for-item-entities: false
  strict-advancement-dimension-check: false
  use-alternative-luck-formula: false
  use-dimension-type-for-custom-spawners: false
proxies:
  bungee-cord:
    online-mode: true
  proxy-protocol: false
  velocity:
    enabled: false
    online-mode: true
    secret: ""
update-checker:
  enabled: false
`

  const paperWorldDefaultsYml = `_version: 31
chunks:
  auto-save-interval: '12000'
  delay-chunk-unloads-by: 1s
  max-auto-save-chunks-per-tick: 4
  prevent-moving-into-unloaded-chunks: false
entities:
  behavior:
    disable-chest-cat-detection: true
    disable-creeper-lingering-effect: true
    disable-player-crits: false
    pillager-patrols:
      disable: true
    zombies-target-turtle-eggs: true
  spawning:
    alt-item-despawn-rate:
      enabled: false
    count-all-mobs-for-spawning: false
    duplicate-uuid:
      mode: SAFE_REGEN
      safe-regen-delete-range: 32
    monster-spawn-max-light-level: default
    per-player-mob-spawns: true
    spawn-limits:
      ambient: 0
      axolotls: 0
      creature: 0
      monster: 0
      underground_water_creature: 0
      water_ambient: 0
      water_creature: 0
    ticks-per-spawn:
      ambient: 9999
      axolotls: 9999
      creature: 9999
      monster: 9999
      underground_water_creature: 9999
      water_ambient: 9999
      water_creature: 9999
environment:
  disable-explosion-knockback: true
  disable-ice-and-snow: true
  disable-thunder: true
  fire-tick-delay: 9999
  frosted-ice:
    enabled: false
  generate-flat-bedrock: false
  locate-structures-outside-world-border: false
  optimize-explosions: true
  void-damage-amount: 4.0
  void-damage-min-build-height-offset: -64.0
tick-rates:
  mob-spawner: 9999
  dry-farmland: 9999
  grass-spread: 9999
  wet-farmland: 9999
unsupported-settings:
  disable-world-ticking-when-empty: true
  fix-invulnerable-end-crystal-exploit: true
`

  writeFileSync(join(serverDir, 'spigot.yml'), spigotYml, 'utf-8')
  writeFileSync(join(serverDir, 'bukkit.yml'), bukkitYml, 'utf-8')
  writeFileSync(join(configDir, 'paper-global.yml'), paperGlobalYml, 'utf-8')
  writeFileSync(join(configDir, 'paper-world-defaults.yml'), paperWorldDefaultsYml, 'utf-8')
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 700,
    resizable: false,
    title: 'Beacon',
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow.show())
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

function spawnServerProcess(serverId, opts) {
  const { serverDir, serverType, jvmMemory, autoRestart, javaPath } = opts
  const javaBin = javaPath || 'java'
  const memStr = jvmMemory ? `${jvmMemory.value}${jvmMemory.unit}` : '2G'
  const jar = serverType === 'paper' ? 'paper.jar' : 'fabric-server-launch.jar'
  // UTF-8フラグでログ文字化けを防止
  // JAVA_TOOL_OPTIONS は shell を介さない場合でも確実に UTF-8 を適用
  const javaEnv = {
    ...process.env,
    JAVA_TOOL_OPTIONS: '-Dfile.encoding=UTF-8 -Dstdout.encoding=UTF-8 -Dconsole.encoding=UTF-8',
  }
  const proc = spawn(javaBin, [
    '-Dfile.encoding=UTF-8',
    '-Dstdout.encoding=UTF-8',
    '-Dconsole.encoding=UTF-8',
    `-Xms${memStr}`, `-Xmx${memStr}`, '-jar', jar, 'nogui'
  ], { cwd: serverDir, shell: false, env: javaEnv })
  processes[serverId] = proc
  const pids = loadPids()
  pids[serverId] = proc.pid
  savePids(pids)
  proc.stdout.setEncoding('utf8')
  proc.stderr.setEncoding('utf8')
  proc.on('error', (err) => {
    if (err.code === 'ENOENT') {
      mainWindow.webContents.send(`log-${serverId}`, `[エラー] Javaが見つかりません。\nJavaをインストールするか、設定でJavaパスを指定してください。\n(実行しようとしたコマンド: ${javaBin})\n`)
    } else {
      mainWindow.webContents.send(`log-${serverId}`, `[エラー] プロセス起動失敗: ${err.message}\n`)
    }
    delete processes[serverId]
    mainWindow.webContents.send(`stopped-${serverId}`)
  })
  proc.stdout.on('data', (msg) => {
    mainWindow.webContents.send(`log-${serverId}`, msg)
    if (msg.includes('Done') && msg.includes('For help')) {
      mainWindow.webContents.send(`started-${serverId}`)
    }
  })
  proc.stderr.on('data', (msg) => mainWindow.webContents.send(`log-${serverId}`, msg))
  proc.on('close', (code) => {
    delete processes[serverId]
    const p = loadPids(); delete p[serverId]; savePids(p)
    const wasManual = manualStops.has(serverId)
    manualStops.delete(serverId)
    const crashed = code !== 0
    if (crashed && autoRestart && !wasManual) {
      mainWindow.webContents.send(`log-${serverId}`, '[AutoRestart] クラッシュを検出しました。5秒後に再起動します...\n')
      mainWindow.webContents.send(`restarting-${serverId}`)
      setTimeout(() => spawnServerProcess(serverId, serverSpawnOpts[serverId] || opts), 5000)
    } else {
      mainWindow.webContents.send(`stopped-${serverId}`)
    }
  })
}

app.whenReady().then(() => {
  app.name = 'Beacon'
  electronApp.setAppUserModelId('com.beacon.app')
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

  ipcMain.handle('load-data', () => loadData())
  ipcMain.handle('save-data', (_, data) => { saveData(data); return true })
  ipcMain.handle('load-settings', () => loadSettings())
  ipcMain.handle('save-settings', (_, settings) => { saveSettings(settings); return true })

  ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('get-suggested-base-dir', () => {
    return app.getPath('userData')
  })

  ipcMain.handle('create-base-dir', (_, { path: dirPath }) => {
    try {
      mkdirSync(dirPath, { recursive: true })
      const settings = loadSettings()
      settings.baseDir = dirPath
      saveSettings(settings)
      return { success: true }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('open-folder', (_, path) => shell.openPath(path))

  ipcMain.handle('delete-server-dir', (_, { serverDir }) => {
    if (serverDir && existsSync(serverDir)) {
      rmSync(serverDir, { recursive: true, force: true })
    }
    return true
  })

  ipcMain.handle('delete-cluster-dir', (_, { clusterDir }) => {
    if (clusterDir && existsSync(clusterDir)) {
      rmSync(clusterDir, { recursive: true, force: true })
    }
    return true
  })

  ipcMain.handle('create-cluster-dir', async (_, { clusterName, baseDir }) => {
    const clusterDir = join(baseDir, clusterName)
    const velocityDir = join(clusterDir, 'velocity')
    if (!existsSync(clusterDir)) mkdirSync(clusterDir, { recursive: true })
    if (!existsSync(velocityDir)) mkdirSync(velocityDir, { recursive: true })

    // クラスター用 DB スキーマを自動作成
    let schemaName = null
    try {
      const settings = loadSettings()
      const db = settings.db
      if (db && await checkDbPortOpen(db.port || 3306)) {
        const conn = await connectAsRoot(db)
        schemaName = `${clusterName}_DB`.replace(/[^a-zA-Z0-9_]/g, '_')
        await conn.query(`CREATE DATABASE IF NOT EXISTS \`${schemaName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
        await conn.end()
      }
    } catch { /* DB未起動時は無視 */ }

    return { clusterDir, velocityDir, schemaName }
  })

  ipcMain.handle('install-velocity', async (_, { velocityDir }) => {
    const { net } = await import('electron')
    const fs = require('fs')
    const send = (msg) => mainWindow.webContents.send('velocity-log', msg)

    const netGet = (url, wantJson) => new Promise((resolve, reject) => {
      const req = net.request({ url, method: 'GET', headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept': wantJson ? 'application/json' : '*/*' } })
      let data = ''
      req.on('response', (r) => {
        r.on('data', c => { data += c })
        r.on('end', () => {
          if (r.statusCode >= 400) return reject(new Error(`HTTP ${r.statusCode}`))
          if (wantJson) { try { resolve(JSON.parse(data)) } catch (e) { reject(e) } } else { resolve(data) }
        })
      })
      req.on('error', reject)
      req.end()
    })

    const netDownload = (url, destPath) => new Promise((resolve, reject) => {
      const req = net.request({ url, method: 'GET', headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } })
      req.on('response', (r) => {
        if (r.statusCode >= 400) { r.resume(); return reject(new Error(`HTTP ${r.statusCode}`)) }
        const file = fs.createWriteStream(destPath)
        r.on('data', c => file.write(c))
        r.on('end', () => { file.close(); resolve() })
        r.on('error', reject)
      })
      req.on('error', reject)
      req.end()
    })

    // PaperMC ダウンロードページの HTML から最新ビルド情報を抽出
    const fetchVelocityFromPage = async () => {
      const html = await netGet('https://papermc.io/downloads/velocity', false)
      // fill-data.papermc.io/v1/objects/{sha256}/{filename} を探す
      const cdnMatch = html.match(/fill-data\.papermc\.io\/v1\/objects\/([a-f0-9]{64})\/(velocity-([^"'\s\\]+)\.jar)/)
      if (cdnMatch) {
        const sha256 = cdnMatch[1], jarName = cdnMatch[2], rest = cdnMatch[3]
        // jarName = "velocity-3.5.0-SNAPSHOT-585" → version = "3.5.0-SNAPSHOT", build = "585"
        const parts = rest.match(/^([\d.]+-SNAPSHOT|[\d.]+)-(\d+)$/)
        return {
          downloadUrl: `https://fill-data.papermc.io/v1/objects/${sha256}/${jarName}`,
          version: parts ? parts[1] : rest,
          build: parts ? parseInt(parts[2]) : 0,
          jarName
        }
      }
      // __NEXT_DATA__ JSON を探す
      const nextMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>(\{.*?\})<\/script>/s)
      if (nextMatch) {
        try {
          const nextData = JSON.parse(nextMatch[1])
          const pageProps = nextData?.props?.pageProps
          const dlInfo = pageProps?.downloads?.velocity || pageProps?.latestBuild
          if (dlInfo) {
            const sha256 = dlInfo.sha256 || dlInfo.hash
            const jarName = dlInfo.name || dlInfo.fileName
            const ver = dlInfo.version || dlInfo.projectVersion
            const bld = dlInfo.build || dlInfo.buildNumber
            if (sha256 && jarName) {
              return { downloadUrl: `https://fill-data.papermc.io/v1/objects/${sha256}/${jarName}`, version: ver, build: bld, jarName }
            }
          }
        } catch { /* ignore */ }
      }
      return null
    }

    try {
      send('Velocityの最新バージョンを取得中...')
      let versionName = null, buildId = null, downloadUrl = null

      // ── PaperMC ダウンロードページ HTML から取得（最優先） ──────────────
      try {
        send('PaperMC ダウンロードページを確認中...')
        const pageInfo = await fetchVelocityFromPage()
        if (pageInfo) {
          versionName = pageInfo.version
          buildId = pageInfo.build
          downloadUrl = pageInfo.downloadUrl
          send(`ページから検出: ${versionName} (build ${buildId})`)
        }
      } catch (e) {
        send(`ページ取得: ${e.message}`)
      }

      // ── v2 API（フォールバック、最大 3.4.0-SNAPSHOT） ──────────────────
      if (!downloadUrl) {
        const v2 = await netGet('https://api.papermc.io/v2/projects/velocity', true)
        const latestVer = (v2.versions || []).at(-1)
        if (!latestVer) throw new Error('バージョン情報が取得できません')
        send(`v2 API: ${latestVer} のビルド情報を取得中...`)
        const buildsData = await netGet(`https://api.papermc.io/v2/projects/velocity/versions/${latestVer}/builds`, true)
        const latestBuild = (buildsData.builds || []).at(-1)
        if (!latestBuild) throw new Error('ビルド情報が取得できません')
        versionName = latestVer
        buildId = latestBuild.build
        const jarName = `velocity-${latestVer}-${buildId}.jar`
        downloadUrl = `https://api.papermc.io/v2/projects/velocity/versions/${latestVer}/builds/${buildId}/downloads/${jarName}`
      }

      send(`Velocity ${versionName} (build ${buildId}) をダウンロード中...`)
      const jarPath = join(velocityDir, 'velocity.jar')
      await netDownload(downloadUrl, jarPath)
      send('Velocityのインストール完了！')
      return { success: true, jarPath, version: versionName, build: buildId }
    } catch (e) {
      send(`エラー: ${e.message}`)
      return { success: false, error: e.message }
    }
  })

  // Velocity の最新バージョン情報を取得（インストールなし）
  ipcMain.handle('fetch-velocity-latest', async () => {
    const { net } = await import('electron')
    const netGet = (url, wantJson) => new Promise((resolve, reject) => {
      const req = net.request({ url, method: 'GET', headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept': wantJson ? 'application/json' : '*/*' } })
      let data = ''
      req.on('response', (r) => {
        r.on('data', c => { data += c })
        r.on('end', () => {
          if (r.statusCode >= 400) return reject(new Error(`HTTP ${r.statusCode}`))
          if (wantJson) { try { resolve(JSON.parse(data)) } catch (e) { reject(e) } } else { resolve(data) }
        })
      })
      req.on('error', reject)
      req.end()
    })
    // PaperMC ダウンロードページから取得
    try {
      const html = await netGet('https://papermc.io/downloads/velocity', false)
      const cdnMatch = html.match(/fill-data\.papermc\.io\/v1\/objects\/([a-f0-9]{64})\/(velocity-([^"'\s\\]+)\.jar)/)
      if (cdnMatch) {
        const rest = cdnMatch[3]
        const parts = rest.match(/^([\d.]+-SNAPSHOT|[\d.]+)-(\d+)$/)
        return { success: true, version: parts ? parts[1] : rest, build: parts ? parseInt(parts[2]) : 0 }
      }
    } catch { /* v2 fallback */ }
    // v2 API フォールバック
    try {
      const v2 = await netGet('https://api.papermc.io/v2/projects/velocity', true)
      const latestVer = (v2.versions || []).at(-1)
      if (latestVer) {
        const buildsData = await netGet(`https://api.papermc.io/v2/projects/velocity/versions/${latestVer}/builds`, true)
        const latestBuild = (buildsData.builds || []).at(-1)
        if (latestBuild) return { success: true, version: latestVer, build: latestBuild.build }
      }
    } catch {}
    return { success: false }
  })

  ipcMain.handle('get-app-version', () => app.getVersion())

  ipcMain.handle('fetch-global-ip', async () => {
    const { net } = await import('electron')
    return new Promise((resolve) => {
      const request = net.request('https://api.ipify.org')
      let data = ''
      request.on('response', (response) => {
        response.on('data', (chunk) => { data += chunk })
        response.on('end', () => resolve(data.trim()))
      })
      request.on('error', () => resolve('取得失敗'))
      request.end()
    })
  })

  ipcMain.handle('fetch-fabric-versions', async () => {
    const { net } = await import('electron')
    return new Promise((resolve) => {
      const request = net.request('https://meta.fabricmc.net/v2/versions/game')
      let data = ''
      request.on('response', (response) => {
        response.on('data', (chunk) => { data += chunk })
        response.on('end', () => {
          try {
            const versions = JSON.parse(data)
              .filter(v => v.stable)
              .slice(0, 20)
              .map(v => v.version)
            resolve(versions)
          } catch { resolve([]) }
        })
      })
      request.on('error', () => resolve([]))
      request.end()
    })
  })

  ipcMain.handle('install-fabric', async (_, { serverName, mcVersion, baseDir, clusterName, serverPort }) => {
    const isCluster = clusterName && clusterName !== 'standalone'
    const clusterDir = join(baseDir, clusterName || 'standalone')
    const serverDir = join(clusterDir, serverName)
    if (!existsSync(serverDir)) mkdirSync(serverDir, { recursive: true })

    const { net } = await import('electron')
    const fs = require('fs')
    const send = (msg) => mainWindow.webContents.send('install-log', msg)

    const netGet = (url) => new Promise((resolve, reject) => {
      const req = net.request({ url, method: 'GET', headers: { 'User-Agent': 'Mozilla/5.0' } })
      let data = ''
      req.on('response', (r) => {
        if (r.statusCode >= 400) { r.resume(); return reject(new Error(`HTTP ${r.statusCode}: ${url}`)) }
        r.on('data', c => { data += c })
        r.on('end', () => { try { resolve(JSON.parse(data)) } catch { resolve(data) } })
      })
      req.on('error', reject)
      req.end()
    })
    const netDownload = (url, destPath) => new Promise((resolve, reject) => {
      const req = net.request({ url, method: 'GET', headers: { 'User-Agent': 'Mozilla/5.0' } })
      req.on('response', (r) => {
        if (r.statusCode >= 400) { r.resume(); return reject(new Error(`HTTP ${r.statusCode}: ${url}`)) }
        const file = fs.createWriteStream(destPath)
        r.on('data', c => file.write(c))
        r.on('end', () => { file.close(); resolve() })
        r.on('error', reject)
      })
      req.on('error', reject)
      req.end()
    })

    try {
      // 1. Fabric ローダーバージョン取得
      send(`${serverName}: Fabricバージョン情報を取得中...`)
      const loaderList = await netGet(`https://meta.fabricmc.net/v2/versions/loader/${mcVersion}?limit=1`)
      if (!loaderList || loaderList.length === 0) throw new Error(`Fabric loader が ${mcVersion} に対応していません`)
      const loaderVersion = loaderList[0].loader.version

      // 2. Fabricインストーラーバージョン取得
      const installerList = await netGet(`https://meta.fabricmc.net/v2/versions/installer?limit=1`)
      if (!installerList || installerList.length === 0) throw new Error('Fabricインストーラー情報の取得に失敗しました')
      const installerVersion = installerList[0].version

      send(`${serverName}: Loader ${loaderVersion} / Installer ${installerVersion}`)

      // 3. Fabric サーバー起動JARをダウンロード（Java不要・Node.jsで直接取得）
      send(`${serverName}: fabric-server-launch.jar をダウンロード中...`)
      const fabricLaunchUrl = `https://meta.fabricmc.net/v2/versions/loader/${mcVersion}/${loaderVersion}/${installerVersion}/server/jar`
      await netDownload(fabricLaunchUrl, join(serverDir, 'fabric-server-launch.jar'))

      // 4. Minecraft server.jar を Mojang API から取得
      send(`${serverName}: Minecraft server.jar をダウンロード中...`)
      const manifest = await netGet('https://launchermeta.mojang.com/mc/game/version_manifest_v2.json')
      const versionEntry = manifest.versions.find(v => v.id === mcVersion)
      if (!versionEntry) throw new Error(`MCバージョン ${mcVersion} がマニフェストに見つかりません`)
      const versionInfo = await netGet(versionEntry.url)
      const serverJarUrl = versionInfo.downloads?.server?.url
      if (!serverJarUrl) throw new Error('server.jar のダウンロードURLが取得できませんでした')
      await netDownload(serverJarUrl, join(serverDir, 'server.jar'))

      send(`${serverName}: ファイルを構成中...`)

      // fabric-server-launch.properties（server.jar の場所を指定）
      writeFileSync(join(serverDir, 'fabric-server-launch.properties'), `serverJar=server.jar\n`)
      writeFileSync(join(serverDir, 'eula.txt'), 'eula=true\n')

      const props = {
        'accepts-transfers': 'true',
        'allow-flight': 'true',
        'broadcast-console-to-ops': 'true',
        'broadcast-rcon-to-ops': 'true',
        'bug-report-link': '',
        'difficulty': 'normal',
        'enable-code-of-conduct': 'false',
        'enable-jmx-monitoring': 'false',
        'enable-query': 'false',
        'enable-rcon': 'false',
        'enable-status': 'true',
        'enforce-secure-profile': 'false',
        'enforce-whitelist': 'false',
        'entity-broadcast-range-percentage': '100',
        'force-gamemode': 'false',
        'function-permission-level': '2',
        'gamemode': 'survival',
        'generate-structures': 'true',
        'generator-settings': '{}',
        'hardcore': 'false',
        'hide-online-players': 'false',
        'initial-disabled-packs': '',
        'initial-enabled-packs': 'vanilla',
        'level-name': serverName,
        'level-seed': '',
        'level-type': 'minecraft\\:normal',
        'log-ips': 'true',
        'management-server-allowed-origins': '',
        'management-server-enabled': 'false',
        'management-server-host': '',
        'management-server-port': '0',
        'management-server-secret': '',
        'management-server-tls-enabled': 'true',
        'management-server-tls-keystore': '',
        'management-server-tls-keystore-password': '',
        'max-chained-neighbor-updates': '1000000',
        'max-players': '20',
        'max-tick-time': '60000',
        'max-world-size': '29999984',
        'motd': 'A Minecraft Server',
        'network-compression-threshold': '512',
        'online-mode': isCluster ? 'false' : 'true',
        'op-permission-level': '4',
        'pause-when-empty-seconds': '60',
        'player-idle-timeout': '0',
        'prevent-proxy-connections': 'false',
        'pvp': 'true',
        'query.port': '25565',
        'rate-limit': '0',
        'rcon.password': '',
        'rcon.port': '25575',
        'region-file-compression': 'deflate',
        'require-resource-pack': 'false',
        'resource-pack': '',
        'resource-pack-id': '',
        'resource-pack-prompt': '',
        'resource-pack-sha1': '',
        'server-ip': '',
        'server-port': String(serverPort || 25565),
        'simulation-distance': '10',
        'spawn-animals': 'true',
        'spawn-monsters': 'true',
        'spawn-npcs': 'true',
        'spawn-protection': '0',
        'status-heartbeat-interval': '0',
        'sync-chunk-writes': 'true',
        'text-filtering-config': '',
        'text-filtering-version': '0',
        'use-native-transport': 'true',
        'view-distance': '10',
        'white-list': 'false',
      }
      const propsContent = Object.entries(props).map(([k, v]) => `${k}=${v}`).join('\n')
      writeFileSync(join(serverDir, 'server.properties'), propsContent)
      writeFileSync(join(serverDir, 'start.bat'),
        `@echo off\njava -Xms2G -Xmx2G -jar fabric-server-launch.jar nogui\npause`)

      send(`${serverName}: インストール完了！`)
      return { success: true, serverDir }
    } catch (e) {
      send(`${serverName}: インストールに失敗しました\n${e.message}`)
      return { success: false }
    }
  })

  ipcMain.handle('setup-fabric-proxy', async (_, { serverDir, mcVersion, forwardingSecret }) => {
    const { net } = await import('electron')
    const fs = require('fs')
    const send = (msg) => mainWindow.webContents.send('install-log', msg)
    const modsDir = join(serverDir, 'mods')
    const configDir = join(serverDir, 'config')
    if (!existsSync(modsDir)) mkdirSync(modsDir, { recursive: true })
    if (!existsSync(configDir)) mkdirSync(configDir, { recursive: true })

    const fetchJson = (url) => new Promise((resolve, reject) => {
      const req = net.request({ url, headers: { 'User-Agent': 'beacon/1.0' } })
      let d = ''
      req.on('response', (r) => {
        r.on('data', (c) => { d += c })
        r.on('end', () => { try { resolve(JSON.parse(d)) } catch { reject(new Error('parse error')) } })
      })
      req.on('error', reject)
      req.end()
    })

    const downloadFile = (url, filePath) => new Promise((resolve, reject) => {
      const req = net.request(url)
      req.on('response', (r) => {
        const file = fs.createWriteStream(filePath)
        r.on('data', (c) => file.write(c))
        r.on('end', () => { file.close(); resolve() })
      })
      req.on('error', reject)
      req.end()
    })

    try {
      // Fabric API
      send('Fabric API を取得中...')
      const faVersions = await fetchJson(`https://api.modrinth.com/v2/project/fabric-api/version?loaders=%5B%22fabric%22%5D&game_versions=%5B%22${mcVersion}%22%5D`)
      if (!faVersions || faVersions.length === 0) {
        send(`Fabric API: ${mcVersion} 対応バージョンが見つかりませんでした`)
      } else {
        const faFile = faVersions[0].files.find(f => f.primary) || faVersions[0].files[0]
        if (faFile) {
          send('Fabric API をダウンロード中...')
          await downloadFile(faFile.url, join(modsDir, faFile.filename))
          send('Fabric API インストール完了！')
        }
      }

      // ClusterConnect
      send('ClusterConnect を取得中...')
      try {
        const { net: net2 } = await import('electron')
        const ccRelease = await new Promise((resolve, reject) => {
          const r = net2.request({ url: 'https://api.github.com/repos/Simohayhe/ClusterConnectFabric/releases/latest', headers: { 'User-Agent': 'beacon/1.0' } })
          let d2 = ''; r.on('response', res => { res.on('data', c => { d2 += c }); res.on('end', () => { try { resolve(JSON.parse(d2)) } catch(e) { reject(e) } }) }); r.on('error', reject); r.end()
        })
        // MCバージョンのメジャー.マイナーに対応するJARを選択（例: 1.21.4 → "1.21"）
        // ファイル名に "1.21" が含まれるものを選ぶ（命名規則不問）
        const majorMinor = (mcVersion || '').match(/^(\d+\.\d+)/)?.[1]
        const allJars = (ccRelease.assets || []).filter(a => a.name.endsWith('.jar'))
        const ccAsset = (majorMinor && allJars.find(a => a.name.includes(majorMinor)))
          || allJars[0]
        if (ccAsset) {
          // 古いClusterConnect JARを削除
          readdirSync(modsDir).filter(f => f.toLowerCase().includes('clusterconnect') && f.endsWith('.jar'))
            .forEach(f => { try { unlinkSync(join(modsDir, f)) } catch { /* skip */ } })
          send(`ClusterConnect ${ccRelease.tag_name} (MC ${majorMinor || mcVersion}) をダウンロード中...`)
          await downloadFile(ccAsset.browser_download_url, join(modsDir, ccAsset.name))
          send('ClusterConnect インストール完了！')
        }
      } catch (e) { send(`ClusterConnect 取得失敗（スキップ）: ${e.message}`) }

      // ClusterConnect 設定ファイル（末尾の空白・改行を除去）
      writeFileSync(join(configDir, 'clusterconnect.json'),
        JSON.stringify({ secret_key: forwardingSecret.trim() }, null, 2), 'utf-8')

      send('プロキシセットアップ完了！')
      return { success: true }
    } catch (e) {
      send(`エラー: ${e.message}`)
      return { success: false }
    }
  })

  ipcMain.handle('scan-cluster-dir', (_, { clusterDir }) => {
    if (!existsSync(clusterDir)) return { success: false, error: 'フォルダが存在しません' }
    const entries = readdirSync(clusterDir, { withFileTypes: true })
    const servers = []
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === 'velocity') continue
      const serverDir = join(clusterDir, entry.name)
      const propsPath = join(serverDir, 'server.properties')
      if (!existsSync(propsPath)) continue
      const content = readFileSync(propsPath, 'utf-8')
      const props = {}
      content.split('\n').forEach(line => {
        if (line.startsWith('#') || !line.includes('=')) return
        const [key, ...rest] = line.split('=')
        props[key.trim()] = rest.join('=').trim()
      })
      const type = detectServerType(serverDir)
      const mcVersion = type === 'fabric' ? detectFabricMcVersion(serverDir) : detectPaperMcVersion(serverDir)
      const levelName = props['level-name'] || 'world'
      const name = resolveServerName(levelName, entry.name)
      servers.push({ name, port: parseInt(props['server-port']) || 25565, serverDir, type, mcVersion, levelName })
    }
    let velocityConfig = null
    const velocityDir = join(clusterDir, 'velocity')
    const tomlPath = join(velocityDir, 'velocity.toml')
    if (existsSync(tomlPath)) {
      const toml = readFileSync(tomlPath, 'utf-8')
      const bindMatch = toml.match(/^bind\s*=\s*"[^:]*:(\d+)"/m)
      const motdMatch = toml.match(/^motd\s*=\s*"(.*)"/m)
      const maxMatch = toml.match(/^show-max-players\s*=\s*(\d+)/m)
      let forwardingSecret = ''
      const secretPath = join(velocityDir, 'forwarding.secret')
      if (existsSync(secretPath)) forwardingSecret = readFileSync(secretPath, 'utf-8').trim()
      velocityConfig = {
        port: bindMatch ? parseInt(bindMatch[1]) : 25577,
        motd: motdMatch ? motdMatch[1] : 'A Velocity Proxy',
        maxPlayers: maxMatch ? parseInt(maxMatch[1]) : 500,
        forwardingSecret,
        forwardingMode: 'modern',
      }
    }
    const clusterName = clusterDir.split(/[\\/]/).pop()
    return { success: true, clusterName, servers, velocityConfig }
  })

  ipcMain.handle('scan-server-dir', (_, { serverDir }) => {
    const propsPath = join(serverDir, 'server.properties')
    if (!existsSync(propsPath)) return { success: false, error: 'server.properties が見つかりません' }
    const content = readFileSync(propsPath, 'utf-8')
    const props = {}
    content.split('\n').forEach(line => {
      if (line.startsWith('#') || !line.includes('=')) return
      const [key, ...rest] = line.split('=')
      props[key.trim()] = rest.join('=').trim()
    })
    const port = parseInt(props['server-port']) || 25565
    const dirName = serverDir.split(/[\\/]/).pop()
    const levelName = props['level-name'] || 'world'
    const name = resolveServerName(levelName, dirName)
    const type = detectServerType(serverDir)
    const mcVersion = type === 'fabric' ? detectFabricMcVersion(serverDir) : detectPaperMcVersion(serverDir)
    return { success: true, name, port, serverDir, type, mcVersion, levelName }
  })

  ipcMain.handle('start-velocity', (_, { clusterId, velocityDir }) => {
    const key = `velocity-${clusterId}`
    if (processes[key]) return false
    // 管理済みJavaから自動選択（Java21 → Java17の順で優先）
    const velSettings = loadSettings()
    const velInstallations = velSettings.javaInstallations || []
    const velBestJava = [25, 21, 17].reduce((found, ver) => found || velInstallations.find(j => j.majorVersion === ver), null)
    const velJavaBin = velBestJava ? velBestJava.path : 'java'
    const proc = spawn(velJavaBin, [
      '-Dfile.encoding=UTF-8', '-Dstdout.encoding=UTF-8', '-Dconsole.encoding=UTF-8',
      '-Xms512M', '-Xmx512M', '-jar', 'velocity.jar'
    ], { cwd: velocityDir, shell: false })
    processes[key] = proc
    const pids = loadPids()
    pids[key] = proc.pid
    savePids(pids)
    proc.stdout.setEncoding('utf8')
    proc.stderr.setEncoding('utf8')
    proc.on('error', (err) => {
      if (err.code === 'ENOENT') {
        mainWindow.webContents.send(`velocity-log-${clusterId}`, `[エラー] Javaが見つかりません。\nJavaをインストールしてPATHを通してください。\n`)
      } else {
        mainWindow.webContents.send(`velocity-log-${clusterId}`, `[エラー] プロセス起動失敗: ${err.message}\n`)
      }
      delete processes[key]
      mainWindow.webContents.send(`velocity-stopped-${clusterId}`)
    })
    proc.stdout.on('data', (d) => {
      mainWindow.webContents.send(`velocity-log-${clusterId}`, d)
      if (d.includes('Listening on')) mainWindow.webContents.send(`velocity-started-${clusterId}`)
    })
    proc.stderr.on('data', (d) => mainWindow.webContents.send(`velocity-log-${clusterId}`, d))
    proc.on('close', () => {
      delete processes[key]
      const p = loadPids(); delete p[key]; savePids(p)
      mainWindow.webContents.send(`velocity-stopped-${clusterId}`)
    })
    return true
  })

  ipcMain.handle('stop-velocity', (_, { clusterId }) => {
    const key = `velocity-${clusterId}`
    const proc = processes[key]
    if (proc) {
      proc.stdin.write('shutdown\n')
      return true
    }
    const pids = loadPids()
    if (pids[key]) {
      try { process.kill(pids[key]) } catch { /* already gone */ }
      delete pids[key]; savePids(pids)
      mainWindow.webContents.send(`velocity-stopped-${clusterId}`)
      return true
    }
    return false
  })

  ipcMain.handle('start-server', async (_, { serverId, serverDir, serverType, jvmMemory, autoRestart, javaPath, isStandalone }) => {
    if (processes[serverId]) return false

    // スタンドアロンサーバーは online-mode=true を強制（既存サーバーの修正も兼ねる）
    if (isStandalone) {
      const propsPath = join(serverDir, 'server.properties')
      if (existsSync(propsPath)) {
        let content = readFileSync(propsPath, 'utf-8')
        if (content.includes('online-mode=false')) {
          content = content.replace(/^online-mode=false$/m, 'online-mode=true')
          writeFileSync(propsPath, content, 'utf-8')
        }
      }
    }

    // Invsync がインストールされている場合、doStartDb で MariaDB を確実に起動してから開始
    try {
      const modsDir = join(serverDir, 'mods')
      if (existsSync(modsDir)) {
        const hasInvsync = readdirSync(modsDir).some(
          (f) => f.toLowerCase().includes('invsync') && f.endsWith('.jar')
        )
        if (hasInvsync) {
          const settings = loadSettings()
          if (settings.db?.installed) {
            await doStartDb(settings.db, settings.baseDir || '')
          }
        }
      }
    } catch { /* DB 自動起動失敗は無視してサーバー起動を続行 */ }

    // javaPath未指定の場合、管理済みJavaから自動選択（Java21 → Java17の順で優先）
    let resolvedJavaPath = javaPath || null
    if (!resolvedJavaPath) {
      const settings = loadSettings()
      const installations = settings.javaInstallations || []
      const best = [25, 21, 17, 8].reduce((found, ver) => found || installations.find(j => j.majorVersion === ver), null)
      if (best) resolvedJavaPath = best.path
    }

    const opts = { serverDir, serverType, jvmMemory, autoRestart: autoRestart || false, javaPath: resolvedJavaPath }
    serverSpawnOpts[serverId] = opts
    spawnServerProcess(serverId, opts)
    return true
  })

  ipcMain.handle('stop-server', (_, { serverId }) => {
    manualStops.add(serverId)
    const proc = processes[serverId]
    if (proc) {
      proc.stdin.write('stop\n')
      return true
    }
    const pids = loadPids()
    if (pids[serverId]) {
      try { process.kill(pids[serverId]) } catch { /* already gone */ }
      delete pids[serverId]; savePids(pids)
      manualStops.delete(serverId)
      mainWindow.webContents.send(`stopped-${serverId}`)
      return true
    }
    manualStops.delete(serverId)
    return false
  })

  ipcMain.handle('send-command', (_, { serverId, command }) => {
    const proc = processes[serverId]
    if (!proc) return false
    proc.stdin.write(command + '\n')
    return true
  })

  ipcMain.handle('copy-server-profile', (_, { srcDir, destDir }) => {
    if (!existsSync(srcDir)) return { success: false }
    const copyRec = (src, dest) => {
      if (!existsSync(dest)) mkdirSync(dest, { recursive: true })
      for (const entry of readdirSync(src, { withFileTypes: true })) {
        const sp = join(src, entry.name), dp = join(dest, entry.name)
        if (entry.isDirectory()) copyRec(sp, dp)
        else try { copyFileSync(sp, dp) } catch { /* skip locked */ }
      }
    }
    copyRec(srcDir, destDir)
    return { success: true }
  })

  ipcMain.handle('delete-world-data', (_, { serverDir, levelName }) => {
    const base = levelName || 'world'
    for (const suffix of ['', '_nether', '_the_end']) {
      const d = join(serverDir, base + suffix)
      if (existsSync(d)) rmSync(d, { recursive: true, force: true })
    }
    return true
  })

  ipcMain.handle('backup-server', (_, { serverDir }) => {
    if (!existsSync(serverDir)) return { success: false }
    const name = serverDir.split(/[\\/]/).pop()
    const now = new Date()
    const ts = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`
    const backupDir = join(serverDir, '..', 'backups', `${name}_${ts}`)
    const copyRec = (src, dest) => {
      if (!existsSync(dest)) mkdirSync(dest, { recursive: true })
      for (const entry of readdirSync(src, { withFileTypes: true })) {
        const sp = join(src, entry.name), dp = join(dest, entry.name)
        if (entry.isDirectory() && entry.name !== 'backups') copyRec(sp, dp)
        else if (!entry.isDirectory()) try { copyFileSync(sp, dp) } catch { /* コピー失敗は無視 */ }
      }
    }
    copyRec(serverDir, backupDir)
    return { success: true, backupDir }
  })

  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

  // ─── DB 自動起動 ─────────────────────────────────────────────────────────
  // アプリ起動時にDBがインストール済みなら自動起動する
  const settingsOnStart = loadSettings()
  if (settingsOnStart.db?.installed && settingsOnStart.db?.binDir) {
    mainWindow.once('ready-to-show', () => {
      setTimeout(() => {
        doStartDb(settingsOnStart.db, settingsOnStart.baseDir || '').catch(() => { /* 無視 */ })
      }, 1000)
    })
  }

  // ウィンドウ表示後に更新チェック（開発環境では無効）
  if (!is.dev) {
    mainWindow.once('ready-to-show', () => {
      autoUpdater.checkForUpdates()
    })
  }
  ipcMain.handle('read-server-properties', (_, { serverDir }) => {
    const propsPath = join(serverDir, 'server.properties')
    if (!existsSync(propsPath)) return null
    const content = readFileSync(propsPath, 'utf-8')
    const props = {}
    content.split('\n').forEach(line => {
      if (line.startsWith('#') || !line.includes('=')) return
      const [key, ...rest] = line.split('=')
      props[key.trim()] = rest.join('=').trim()
    })
    return props
  })
  
  ipcMain.handle('write-server-properties', (_, { serverDir, properties }) => {
    const propsPath = join(serverDir, 'server.properties')
    const lines = Object.entries(properties).map(([k, v]) => `${k}=${v}`)
    writeFileSync(propsPath, lines.join('\n'), 'utf-8')
    return true
  })

  ipcMain.handle('write-velocity-toml', (_, { velocityDir, servers, port, motd, maxPlayers, forwardingMode, forwardingSecret, tryServers }) => {
    const modeUpper = (forwardingMode || 'modern').toUpperCase()
    const serverLines = (servers || []).map(s => `${s.name} = "127.0.0.1:${s.port}"`).join('\n')
    // tryServers が指定されていればそれを使用、なければ先頭サーバーをデフォルト
    const tryNames = Array.isArray(tryServers) && tryServers.length > 0
      ? tryServers
      : (servers?.length > 0 ? [servers[0].name] : [])
    const tryLine = tryNames.length > 0 ? `try = [${tryNames.map(n => `"${n}"`).join(', ')}]` : 'try = []'
    const toml = `config-version = "2.7"
bind = "0.0.0.0:${port || 25577}"
motd = "${motd || 'A Velocity Proxy'}"
show-max-players = ${maxPlayers || 500}
online-mode = true
force-key-authentication = false
prevent-client-proxy-connections = false
player-info-forwarding-mode = "${modeUpper}"
forwarding-secret-file = "forwarding.secret"
announce-forge = false
kick-existing-players = false
ping-passthrough = "DISABLED"
enable-player-address-logging = true

[servers]
${serverLines}
${tryLine}

[forced-hosts]

[advanced]
compression-threshold = 256
compression-level = -1
login-ratelimit = 0
connection-timeout = 5000
read-timeout = 30000
haproxy-protocol = false
tcp-fast-open = false
bungee-plugin-message-channel = true
show-ping-requests = false
failover-on-unexpected-disconnect = false
announce-proxy-commands = true
log-command-executions = false
log-player-connections = true
[advanced.query]
enabled = false
port = 25777
map = "Velocity"
show-plugins = false
`
    writeFileSync(join(velocityDir, 'velocity.toml'), toml, 'utf-8')
    if (forwardingSecret) {
      const trimmedSecret = forwardingSecret.trim()
      writeFileSync(join(velocityDir, 'forwarding.secret'), trimmedSecret, 'utf-8')
      // バックエンドサーバーのフォワーディングシークレットも同期する
      for (const srv of servers || []) {
        if (!srv.serverDir) continue
        const serverType = srv.type || 'fabric'
        const configDir = join(srv.serverDir, 'config')
        if (serverType === 'fabric') {
          const ccPath = join(configDir, 'clusterconnect.json')
          if (existsSync(ccPath)) {
            try {
              const cc = JSON.parse(readFileSync(ccPath, 'utf-8'))
              cc.secret_key = trimmedSecret
              writeFileSync(ccPath, JSON.stringify(cc, null, 2), 'utf-8')
            } catch { /* 読み書き失敗は無視 */ }
          }
        } else if (serverType === 'paper') {
          const paperGlobalPath = join(configDir, 'paper-global.yml')
          if (existsSync(paperGlobalPath)) {
            try {
              let content = readFileSync(paperGlobalPath, 'utf-8')
              content = content.replace(/(velocity:[\s\S]*?secret:\s*")[^"]*(")/m, `$1${trimmedSecret}$2`)
              writeFileSync(paperGlobalPath, content, 'utf-8')
            } catch { /* 読み書き失敗は無視 */ }
          }
        }
      }
    }
    return true
  })

  ipcMain.handle('fetch-paper-versions', async () => {
    const { net } = await import('electron')
    return new Promise((resolve) => {
      const req = net.request('https://api.papermc.io/v2/projects/paper')
      let d = ''
      req.on('response', (r) => {
        r.on('data', (c) => { d += c })
        r.on('end', () => {
          try { resolve(JSON.parse(d).versions.reverse().slice(0, 20)) } catch { resolve([]) }
        })
      })
      req.on('error', () => resolve([]))
      req.end()
    })
  })

  ipcMain.handle('install-paper', async (_, { serverName, mcVersion, baseDir, clusterName, serverPort, voidWorld }) => {
    const { net } = await import('electron')
    const fs = require('fs')
    const isCluster = clusterName && clusterName !== 'standalone'
    const clusterDir = join(baseDir, clusterName || 'standalone')
    const serverDir = join(clusterDir, serverName)
    if (!existsSync(serverDir)) mkdirSync(serverDir, { recursive: true })
    const send = (msg) => mainWindow.webContents.send('install-log', msg)

    const fetchJson = (url) => new Promise((resolve, reject) => {
      const req = net.request({ url, headers: { 'User-Agent': 'beacon/1.0' } })
      let d = ''
      req.on('response', (r) => {
        r.on('data', (c) => { d += c })
        r.on('end', () => { try { resolve(JSON.parse(d)) } catch { reject(new Error('parse error')) } })
      })
      req.on('error', reject)
      req.end()
    })

    const downloadFile = (url, filePath) => new Promise((resolve, reject) => {
      const req = net.request(url)
      req.on('response', (r) => {
        const file = fs.createWriteStream(filePath)
        r.on('data', (c) => file.write(c))
        r.on('end', () => { file.close(); resolve() })
      })
      req.on('error', reject)
      req.end()
    })

    try {
      send(`Paper ${mcVersion} のビルドを取得中...`)
      const buildsData = await fetchJson(`https://api.papermc.io/v2/projects/paper/versions/${mcVersion}/builds`)
      const latestBuild = buildsData.builds.at(-1).build
      const jarName = `paper-${mcVersion}-${latestBuild}.jar`
      const dlUrl = `https://api.papermc.io/v2/projects/paper/versions/${mcVersion}/builds/${latestBuild}/downloads/${jarName}`
      send(`Paper ${mcVersion} (build ${latestBuild}) をダウンロード中...`)
      await downloadFile(dlUrl, join(serverDir, 'paper.jar'))
      writeFileSync(join(serverDir, 'eula.txt'), 'eula=true\n')
      const props = voidWorld ? {
        'level-name': serverName,
        'level-type': 'minecraft\\:flat',
        'generator-settings': '{"layers":[{"block":"minecraft:air","height":1}],"biome":"minecraft:the_void"}',
        'generate-structures': 'false',
        'online-mode': isCluster ? 'false' : 'true',
        'server-port': String(serverPort || 25565),
        'enforce-secure-profile': 'false',
        'prevent-proxy-connections': 'false',
        'max-players': '20',
        'motd': 'A Minecraft Server',
        'spawn-protection': '0',
        'allow-flight': 'true',
        'pvp': 'false',
        'difficulty': 'peaceful',
        'gamemode': 'adventure',
      } : {
        'level-name': serverName,
        'online-mode': isCluster ? 'false' : 'true',
        'server-port': String(serverPort || 25565),
        'enforce-secure-profile': 'false',
        'prevent-proxy-connections': 'false',
        'max-players': '20',
        'motd': 'A Minecraft Server',
        'spawn-protection': '0',
        'allow-flight': 'true',
      }
      const propsContent = Object.entries(props).map(([k, v]) => `${k}=${v}`).join('\n')
      writeFileSync(join(serverDir, 'server.properties'), propsContent)
      writeFileSync(join(serverDir, 'start.bat'), `@echo off\njava -Xms2G -Xmx2G -jar paper.jar nogui\npause`)
      if (voidWorld) writeVoidWorldConfigs(serverDir)
      send(`${serverName}: インストール完了！`)
      return { success: true, serverDir }
    } catch (e) {
      send(`エラー: ${e.message}`)
      return { success: false }
    }
  })

  ipcMain.handle('setup-paper-proxy', (_, { serverDir, forwardingSecret }) => {
    const configDir = join(serverDir, 'config')
    if (!existsSync(configDir)) mkdirSync(configDir, { recursive: true })
    const configPath = join(configDir, 'paper-global.yml')
    const trimmedSecret = (forwardingSecret || '').trim()
    if (existsSync(configPath)) {
      let content = readFileSync(configPath, 'utf-8')
      content = content
        .replace('enabled: false\n    online-mode: true\n    secret: ""',
          `enabled: true\n    online-mode: true\n    secret: "${trimmedSecret}"`)
      writeFileSync(configPath, content, 'utf-8')
    } else {
      const yaml = `_version: 30\nproxies:\n  bungee-cord:\n    online-mode: true\n  velocity:\n    enabled: true\n    online-mode: true\n    secret: "${trimmedSecret}"\n`
      writeFileSync(configPath, yaml, 'utf-8')
    }
    return true
  })

  ipcMain.handle('get-library-structure', () => {
    const data = loadData()
    const modSources = data.modSources || []
    const mods = modSources.map(source => {
      const files = (source.dir && existsSync(source.dir))
        ? readdirSync(source.dir).filter(f => f.endsWith('.jar'))
        : []
      return { id: source.id, loader: source.loader, version: source.version, dir: source.dir, files }
    })
    const paperSources = (data.paperPluginSources || []).map(src => ({
      id: src.id, dir: src.dir,
      files: (src.dir && existsSync(src.dir)) ? readdirSync(src.dir).filter(f => f.endsWith('.jar')) : []
    }))
    const velocitySources = (data.velocityPluginSources || []).map(src => ({
      id: src.id, dir: src.dir,
      files: (src.dir && existsSync(src.dir)) ? readdirSync(src.dir).filter(f => f.endsWith('.jar')) : []
    }))
    return { mods, paperSources, velocitySources }
  })

  ipcMain.handle('add-mod-source', (_, { loader, version, dir }) => {
    const data = loadData()
    if (!data.modSources) data.modSources = []
    data.modSources.push({ id: Date.now().toString(), loader, version, dir })
    saveData(data)
    return data.modSources
  })

  ipcMain.handle('remove-mod-source', (_, { id }) => {
    const data = loadData()
    if (!data.modSources) data.modSources = []
    data.modSources = data.modSources.filter(s => s.id !== id)
    saveData(data)
    return data.modSources
  })

  ipcMain.handle('add-paper-plugin-source', (_, { dir }) => {
    const data = loadData()
    if (!data.paperPluginSources) data.paperPluginSources = []
    data.paperPluginSources.push({ id: Date.now().toString(), dir })
    saveData(data)
    return data.paperPluginSources
  })

  ipcMain.handle('remove-paper-plugin-source', (_, { id }) => {
    const data = loadData()
    data.paperPluginSources = (data.paperPluginSources || []).filter(s => s.id !== id)
    saveData(data)
    return data.paperPluginSources
  })

  ipcMain.handle('add-velocity-plugin-source', (_, { dir }) => {
    const data = loadData()
    if (!data.velocityPluginSources) data.velocityPluginSources = []
    data.velocityPluginSources.push({ id: Date.now().toString(), dir })
    saveData(data)
    return data.velocityPluginSources
  })

  ipcMain.handle('remove-velocity-plugin-source', (_, { id }) => {
    const data = loadData()
    data.velocityPluginSources = (data.velocityPluginSources || []).filter(s => s.id !== id)
    saveData(data)
    return data.velocityPluginSources
  })

  ipcMain.handle('add-library-item', (_, { category, loader, version, srcPath, sourceId }) => {
    const data = loadData()
    let destDir
    if (category === 'mod') {
      const source = (data.modSources || []).find(s => s.loader === loader && s.version === version)
      if (!source || !source.dir) return { error: 'Modソースが登録されていません' }
      destDir = source.dir
    } else if (category === 'paper-plugin') {
      const sources = data.paperPluginSources || []
      const source = sourceId ? sources.find(s => s.id === sourceId) : sources[0]
      if (!source || !source.dir) return { error: 'Paper Pluginフォルダが登録されていません' }
      destDir = source.dir
    } else {
      const sources = data.velocityPluginSources || []
      const source = sourceId ? sources.find(s => s.id === sourceId) : sources[0]
      if (!source || !source.dir) return { error: 'Velocity Pluginフォルダが登録されていません' }
      destDir = source.dir
    }
    if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true })
    const filename = srcPath.split(/[\\/]/).pop()
    copyFileSync(srcPath, join(destDir, filename))
    return { filename }
  })

  ipcMain.handle('remove-library-item', (_, { category, loader, version, filename, sourceId }) => {
    const data = loadData()
    let dir
    if (category === 'mod') {
      const source = (data.modSources || []).find(s => s.loader === loader && s.version === version)
      dir = source?.dir || ''
    } else if (category === 'paper-plugin') {
      const sources = data.paperPluginSources || []
      const source = sourceId ? sources.find(s => s.id === sourceId) : sources[0]
      dir = source?.dir || ''
    } else {
      const sources = data.velocityPluginSources || []
      const source = sourceId ? sources.find(s => s.id === sourceId) : sources[0]
      dir = source?.dir || ''
    }
    if (!dir) return false
    const filePath = join(dir, filename)
    if (existsSync(filePath)) unlinkSync(filePath)
    return true
  })

  ipcMain.handle('apply-server-mods', (_, { serverDir, enabledMods, libraryModsDir, librarySources }) => {
    const serverModsDir = join(serverDir, 'mods')
    if (!existsSync(serverModsDir)) mkdirSync(serverModsDir, { recursive: true })
    if (librarySources && librarySources.length > 0) {
      const fileMap = {}
      ;(librarySources || []).forEach(src => {
        ;(src.files || []).forEach(f => { fileMap[f] = src.dir })
      })
      Object.keys(fileMap).forEach(filename => {
        const serverPath = join(serverModsDir, filename)
        if (existsSync(serverPath) && !enabledMods.includes(filename)) unlinkSync(serverPath)
      })
      enabledMods.forEach(filename => {
        const srcDir = fileMap[filename]
        if (!srcDir) return
        const srcPath = join(srcDir, filename)
        const destPath = join(serverModsDir, filename)
        if (existsSync(srcPath)) copyFileSync(srcPath, destPath)
      })
    } else {
      const libraryFiles = existsSync(libraryModsDir) ? readdirSync(libraryModsDir).filter(f => f.endsWith('.jar')) : []
      libraryFiles.forEach(filename => {
        const serverPath = join(serverModsDir, filename)
        if (existsSync(serverPath) && !enabledMods.includes(filename)) unlinkSync(serverPath)
      })
      enabledMods.forEach(filename => {
        const srcPath = join(libraryModsDir, filename)
        const destPath = join(serverModsDir, filename)
        if (existsSync(srcPath)) copyFileSync(srcPath, destPath)
      })
    }
    return true
  })

  ipcMain.handle('apply-server-plugins', (_, { serverDir, enabledPlugins, librarySources }) => {
    const serverPluginsDir = join(serverDir, 'plugins')
    if (!existsSync(serverPluginsDir)) mkdirSync(serverPluginsDir, { recursive: true })
    const fileMap = {}
    ;(librarySources || []).forEach(src => {
      ;(src.files || []).forEach(f => { fileMap[f] = src.dir })
    })
    Object.keys(fileMap).forEach(filename => {
      const serverPath = join(serverPluginsDir, filename)
      if (existsSync(serverPath) && !enabledPlugins.includes(filename)) unlinkSync(serverPath)
    })
    enabledPlugins.forEach(filename => {
      const srcDir = fileMap[filename]
      if (!srcDir) return
      const srcPath = join(srcDir, filename)
      const destPath = join(serverPluginsDir, filename)
      if (existsSync(srcPath)) copyFileSync(srcPath, destPath)
    })
    return true
  })

  ipcMain.handle('select-file', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'JAR Files', extensions: ['jar'] }]
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('select-java-exe', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Java Executable', extensions: ['exe'] }]
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('delete-java-installation', (_, { path: javaExe, source }) => {
    if (source === 'managed' && javaExe && existsSync(javaExe)) {
      // java.exe は bin/java.exe なので 2階層上がJDKルート
      const jdkRoot = join(javaExe, '..', '..')
      const managedDir = join(app.getPath('userData'), 'java')
      // managedDir の直下であることを確認してから削除
      const resolved = require('path').resolve(jdkRoot)
      const managedResolved = require('path').resolve(managedDir)
      if (resolved.startsWith(managedResolved + require('path').sep)) {
        rmSync(resolved, { recursive: true, force: true })
      }
    }
    return true
  })

  let libraryWatcher = null
  const closeLibraryWatcher = () => {
    if (libraryWatcher) {
      try { libraryWatcher.close() } catch { /* ignore */ }
      libraryWatcher = null
    }
  }
  ipcMain.handle('watch-library', () => {
    closeLibraryWatcher()
    const data = loadData()
    const modSourceDirs = (data.modSources || []).map(s => s.dir).filter(Boolean)
    const paperSourceDirs = (data.paperPluginSources || []).map(s => s.dir).filter(Boolean)
    const velocitySourceDirs = (data.velocityPluginSources || []).map(s => s.dir).filter(Boolean)
    const dirs = [...modSourceDirs, ...paperSourceDirs, ...velocitySourceDirs].filter(d => d && existsSync(d))
    if (dirs.length === 0) return false
    const watchers = []
    dirs.forEach(dir => {
      try {
        const w = watch(dir, { recursive: true }, () => {
          if (mainWindow) mainWindow.webContents.send('library-changed')
        })
        watchers.push(w)
      } catch { /* ignore */ }
    })
    if (watchers.length === 0) return false
    libraryWatcher = { close: () => watchers.forEach(w => { try { w.close() } catch { /* ignore */ } }) }
    return true
  })
  ipcMain.handle('unwatch-library', () => {
    closeLibraryWatcher()
    return true
  })

  ipcMain.handle('check-port', (_, { port }) => {
    return new Promise((resolve) => {
      const socket = createConnection(port, '127.0.0.1')
      const timer = setTimeout(() => { socket.destroy(); resolve(false) }, 1000)
      socket.on('connect', () => { clearTimeout(timer); socket.destroy(); resolve(true) })
      socket.on('error', () => { clearTimeout(timer); resolve(false) })
    })
  })
})

// ─── Modrinth ────────────────────────────────────────────────────────────────

async function modrinthFetch(url) {
  const { net } = await import('electron')
  return new Promise((resolve, reject) => {
    const req = net.request({ url, headers: { 'User-Agent': 'beacon/1.0 (github.com/Simohayhe/Beacon)' } })
    let d = ''
    req.on('response', r => {
      r.on('data', c => { d += c })
      r.on('end', () => { try { resolve(JSON.parse(d)) } catch (e) { reject(e) } })
    })
    req.on('error', reject)
    req.end()
  })
}

async function modrinthPost(url, body) {
  const { net } = await import('electron')
  return new Promise((resolve, reject) => {
    const req = net.request({
      method: 'POST', url,
      headers: { 'User-Agent': 'beacon/1.0', 'Content-Type': 'application/json' }
    })
    let d = ''
    req.on('response', r => {
      r.on('data', c => { d += c })
      r.on('end', () => { try { resolve(JSON.parse(d)) } catch (e) { reject(e) } })
    })
    req.on('error', reject)
    req.write(JSON.stringify(body))
    req.end()
  })
}

async function translateToJapanese(text) {
  if (!text) return ''
  const { net } = await import('electron')
  return new Promise((resolve) => {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ja&dt=t&q=${encodeURIComponent(text)}`
    const req = net.request(url)
    let d = ''
    req.on('response', r => {
      r.on('data', c => { d += c })
      r.on('end', () => {
        try {
          const json = JSON.parse(d)
          const translated = (json[0] || []).map(s => s[0]).join('')
          resolve(translated || text)
        } catch { resolve(text) }
      })
    })
    req.on('error', () => resolve(text))
    req.end()
  })
}

ipcMain.handle('modrinth-resolve-files', async (_, { dir, filenames }) => {
  const crypto = require('crypto')
  const fs = require('fs')
  const hashMap = {} // sha1 -> filename
  for (const filename of filenames) {
    try {
      const buf = fs.readFileSync(join(dir, filename))
      const hash = crypto.createHash('sha1').update(buf).digest('hex')
      hashMap[hash] = filename
    } catch { /* skip */ }
  }
  if (Object.keys(hashMap).length === 0) return {}
  try {
    const versionData = await modrinthPost(
      'https://api.modrinth.com/v2/version_files',
      { hashes: Object.keys(hashMap), algorithm: 'sha1' }
    )
    const projectIds = [...new Set(Object.values(versionData).map(v => v.project_id))]
    if (projectIds.length === 0) return {}
    const projects = await modrinthFetch(
      `https://api.modrinth.com/v2/projects?ids=${encodeURIComponent(JSON.stringify(projectIds))}`
    )
    const projectMap = {}
    for (const p of projects) projectMap[p.id] = { title: p.title, iconUrl: p.icon_url, description: p.description || '' }
    const result = {}
    for (const [hash, ver] of Object.entries(versionData)) {
      const filename = hashMap[hash]
      const proj = projectMap[ver.project_id]
      if (filename && proj) {
        const descJa = await translateToJapanese(proj.description)
        result[filename] = { title: proj.title, iconUrl: proj.iconUrl, description: descJa }
      }
    }
    return result
  } catch { return {} }
})

ipcMain.handle('modrinth-search', async (_, { query, loader, mcVersion }) => {
  try {
    const facets = [['project_type:mod']]
    if (loader) facets.push([`categories:${loader}`])
    if (mcVersion) facets.push([`versions:${mcVersion}`])
    const url = `https://api.modrinth.com/v2/search?query=${encodeURIComponent(query)}&limit=20&facets=${encodeURIComponent(JSON.stringify(facets))}`
    const result = await modrinthFetch(url)
    return result.hits || []
  } catch { return [] }
})

ipcMain.handle('modrinth-versions', async (_, { projectId, loader, mcVersion }) => {
  try {
    const params = []
    if (loader) params.push(`loaders=${encodeURIComponent(JSON.stringify([loader]))}`)
    if (mcVersion) params.push(`game_versions=${encodeURIComponent(JSON.stringify([mcVersion]))}`)
    const url = `https://api.modrinth.com/v2/project/${projectId}/version${params.length ? '?' + params.join('&') : ''}`
    return await modrinthFetch(url)
  } catch { return [] }
})

ipcMain.handle('modrinth-download', async (_, { url, filename, destDir }) => {
  const { net } = await import('electron')
  const fs = require('fs')
  const destPath = join(destDir, filename)
  try {
    await new Promise((resolve, reject) => {
      const req = net.request(url)
      req.on('response', r => {
        const total = parseInt(r.headers['content-length'] || '0')
        let received = 0
        const file = fs.createWriteStream(destPath)
        r.on('data', c => {
          file.write(c)
          received += c.length
          if (total) mainWindow?.webContents.send('modrinth-download-progress', { percent: Math.floor(received / total * 100) })
        })
        r.on('end', () => { file.close(); resolve() })
        r.on('error', reject)
      })
      req.on('error', reject)
      req.end()
    })
    return { success: true, path: destPath }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

// ─── Java Management ─────────────────────────────────────────────────────────

function getJavaMajorVersion(javaExe) {
  return new Promise(resolve => {
    const proc = spawn(javaExe, ['-version'])
    let output = ''
    proc.stderr.on('data', d => { output += d })
    proc.stdout.on('data', d => { output += d })
    proc.on('close', () => {
      const match = output.match(/version "(\d+)(?:\.(\d+))?/)
      if (!match) return resolve(null)
      const major = parseInt(match[1])
      resolve(major === 1 ? parseInt(match[2]) : major)
    })
    proc.on('error', () => resolve(null))
  })
}

async function scanJavaBaseDir(baseDir, results) {
  if (!existsSync(baseDir)) return
  let entries
  try { entries = readdirSync(baseDir) } catch { return }
  for (const name of entries) {
    const javaExe = join(baseDir, name, 'bin', 'java.exe')
    if (!existsSync(javaExe)) continue
    const majorVersion = await getJavaMajorVersion(javaExe)
    if (majorVersion) results.push({ path: javaExe, majorVersion, source: 'auto' })
  }
}

ipcMain.handle('detect-java', async () => {
  const results = []
  const searchDirs = [
    'C:\\Program Files\\Eclipse Adoptium',
    'C:\\Program Files\\Eclipse Foundation',
    'C:\\Program Files\\Microsoft',
    'C:\\Program Files\\Java',
    'C:\\Program Files\\Zulu',
    'C:\\Program Files\\BellSoft',
    'C:\\Program Files\\Amazon Corretto',
    'C:\\Program Files (x86)\\Java',
  ]
  for (const dir of searchDirs) await scanJavaBaseDir(dir, results)

  // アプリが管理するJavaディレクトリ
  const managedDir = join(app.getPath('userData'), 'java')
  if (existsSync(managedDir)) {
    for (const slot of readdirSync(managedDir)) {
      const slotDir = join(managedDir, slot)
      // Adoptiumのzipは内側にさらに1段ディレクトリがある
      let found = false
      try {
        for (const inner of readdirSync(slotDir)) {
          const exe = join(slotDir, inner, 'bin', 'java.exe')
          if (existsSync(exe)) {
            const majorVersion = await getJavaMajorVersion(exe)
            if (majorVersion) { results.push({ path: exe, majorVersion, source: 'managed' }); found = true }
          }
        }
      } catch { /* スキャン失敗は無視 */ }
      if (!found) {
        const exe = join(slotDir, 'bin', 'java.exe')
        if (existsSync(exe)) {
          const majorVersion = await getJavaMajorVersion(exe)
          if (majorVersion) results.push({ path: exe, majorVersion, source: 'managed' })
        }
      }
    }
  }

  // PATH上のjava
  await new Promise(resolve => {
    const where = spawn('where', ['java'], { shell: true })
    let out = ''
    where.stdout.on('data', d => { out += d })
    where.on('close', async () => {
      const paths = out.split('\n').map(l => l.trim()).filter(Boolean)
      for (const p of paths) {
        if (!existsSync(p)) continue
        if (results.find(r => r.path.toLowerCase() === p.toLowerCase())) continue
        const majorVersion = await getJavaMajorVersion(p)
        if (majorVersion) results.push({ path: p, majorVersion, source: 'path' })
      }
      resolve()
    })
    where.on('error', () => resolve())
  })

  // パス重複排除
  const seen = new Set()
  return results.filter(r => {
    const key = r.path.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key); return true
  })
})

ipcMain.handle('validate-java-path', async (_, { path: javaExe }) => {
  if (!existsSync(javaExe)) return { valid: false, error: 'ファイルが見つかりません' }
  const majorVersion = await getJavaMajorVersion(javaExe)
  if (!majorVersion) return { valid: false, error: 'Javaバージョンを取得できません' }
  return { valid: true, majorVersion }
})

ipcMain.handle('install-java', async (_, { majorVersion }) => {
  const { net } = await import('electron')
  const fs = require('fs')
  const javaBaseDir = join(app.getPath('userData'), 'java')
  mkdirSync(javaBaseDir, { recursive: true })

  const fetchJson = (url) => new Promise((resolve, reject) => {
    const req = net.request({ url, headers: { 'User-Agent': 'beacon/1.0' } })
    let d = ''
    req.on('response', r => {
      r.on('data', c => { d += c })
      r.on('end', () => { try { resolve(JSON.parse(d)) } catch (e) { reject(e) } })
    })
    req.on('error', reject)
    req.end()
  })

  try {
    mainWindow?.webContents.send('java-install-log', `Java ${majorVersion} の情報を取得中...`)
    const apiUrl = `https://api.adoptium.net/v3/assets/latest/${majorVersion}/hotspot?os=windows&arch=x64&image_type=jdk`
    const meta = await fetchJson(apiUrl)
    if (!meta || meta.length === 0) throw new Error('ダウンロード情報が見つかりません')

    const pkg = meta[0].binary.package
    const zipPath = join(javaBaseDir, pkg.name)
    const extractDir = join(javaBaseDir, `jdk-${majorVersion}`)

    mainWindow?.webContents.send('java-install-log', `ダウンロード中: ${pkg.name}`)
    await new Promise((resolve, reject) => {
      const req = net.request(pkg.link)
      req.on('response', r => {
        const total = parseInt(r.headers['content-length'] || '0')
        let received = 0
        const file = fs.createWriteStream(zipPath)
        r.on('data', c => {
          file.write(c)
          received += c.length
          if (total) mainWindow?.webContents.send('java-install-progress', { majorVersion, percent: Math.floor(received / total * 100) })
        })
        r.on('end', () => { file.close(); resolve() })
        r.on('error', reject)
      })
      req.on('error', reject)
      req.end()
    })

    mainWindow?.webContents.send('java-install-log', '展開中...')
    if (existsSync(extractDir)) rmSync(extractDir, { recursive: true, force: true })
    mkdirSync(extractDir, { recursive: true })
    await new Promise((resolve, reject) => {
      const ps = spawn('powershell', [
        '-NoProfile', '-NonInteractive', '-Command',
        `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${extractDir}' -Force`
      ])
      ps.on('close', code => code === 0 ? resolve() : reject(new Error('展開に失敗しました')))
      ps.on('error', reject)
    })

    const innerDirs = readdirSync(extractDir).filter(n => existsSync(join(extractDir, n, 'bin', 'java.exe')))
    if (innerDirs.length === 0) throw new Error('java.exe が見つかりません')
    const javaExe = join(extractDir, innerDirs[0], 'bin', 'java.exe')
    try { unlinkSync(zipPath) } catch { /* ZIP削除失敗は無視 */ }

    mainWindow?.webContents.send('java-install-log', `Java ${majorVersion} のインストール完了`)
    mainWindow?.webContents.send('java-install-done', { majorVersion, path: javaExe })
    return { success: true, path: javaExe, majorVersion }
  } catch (e) {
    mainWindow?.webContents.send('java-install-log', `エラー: ${e.message}`)
    return { success: false, error: e.message }
  }
})

// 自動更新
autoUpdater.autoDownload = true
autoUpdater.autoInstallOnAppQuit = false

autoUpdater.on('update-available', (info) => {
  mainWindow?.webContents.send('update-available', { version: info.version })
})

autoUpdater.on('download-progress', (progress) => {
  mainWindow?.webContents.send('update-download-progress', { percent: Math.floor(progress.percent) })
})

autoUpdater.on('update-downloaded', (info) => {
  mainWindow?.webContents.send('update-downloaded', { version: info.version })
})

autoUpdater.on('error', (err) => {
  console.error('autoUpdater error:', err.message)
  // 初回チェック失敗（ネットワークエラー、未設定など）はUIに表示しない
  const msg = err.message || ''
  const isCheckError = msg.includes('net::') || msg.includes('ENOTFOUND') ||
    msg.includes('ECONNREFUSED') || msg.includes('Cannot find latest') ||
    msg.includes('HttpError') || msg.includes('404') || msg.includes('ERR_')
  if (!isCheckError) {
    mainWindow?.webContents.send('update-error', { message: msg })
  }
})

ipcMain.handle('install-update', () => {
  autoUpdater.quitAndInstall()
})

// ─── 必須Mod チェック & 修復 ────────────────────────────────────────────────────

// 必須Mod（ClusterConnect / FabricAPI）の存在確認
ipcMain.handle('check-required-mods', (_, { serverDir, isCluster }) => {
  const modsDir = join(serverDir, 'mods')
  if (!existsSync(modsDir)) return { ok: false, missing: ['FabricAPI', 'ClusterConnect'] }

  const files = readdirSync(modsDir).filter(f => f.endsWith('.jar')).map(f => f.toLowerCase())
  const hasFabricApi      = files.some(f => f.includes('fabric-api') || f.includes('fabricapi'))
  const hasClusterConnect = files.some(f => f.includes('clusterconnect'))

  const missing = []
  if (!hasFabricApi) missing.push('FabricAPI')
  if (isCluster && !hasClusterConnect) missing.push('ClusterConnect')
  return { ok: missing.length === 0, missing }
})

// 必須Mod 修復（再ダウンロード）
ipcMain.handle('repair-required-mods', async (_, { serverDir, mcVersion, forwardingSecret, missingMods }) => {
  const { net } = await import('electron')
  const fs = require('fs')
  const modsDir = join(serverDir, 'mods')
  const configDir = join(serverDir, 'config')
  if (!existsSync(modsDir)) mkdirSync(modsDir, { recursive: true })
  if (!existsSync(configDir)) mkdirSync(configDir, { recursive: true })
  const send = (msg) => mainWindow?.webContents.send('install-log', msg)

  const fetchJson = (url) => new Promise((resolve, reject) => {
    const req = net.request({ url, headers: { 'User-Agent': 'beacon/1.0' } })
    let d = ''; req.on('response', r => { r.on('data', c => { d += c }); r.on('end', () => { try { resolve(JSON.parse(d)) } catch (e) { reject(e) } }) }); req.on('error', reject); req.end()
  })
  const downloadFile = (url, filePath) => new Promise((resolve, reject) => {
    const req = net.request(url)
    req.on('response', r => { const file = fs.createWriteStream(filePath); r.on('data', c => file.write(c)); r.on('end', () => { file.close(); resolve() }) }); req.on('error', reject); req.end()
  })

  const results = []
  if (missingMods.includes('FabricAPI') && mcVersion) {
    try {
      send('FabricAPI を修復中...')
      const versions = await fetchJson(`https://api.modrinth.com/v2/project/fabric-api/version?loaders=%5B%22fabric%22%5D&game_versions=%5B%22${mcVersion}%22%5D`)
      const file = versions?.[0]?.files?.find(f => f.primary) || versions?.[0]?.files?.[0]
      if (file) { await downloadFile(file.url, join(modsDir, file.filename)); results.push('FabricAPI') }
    } catch (e) { send(`FabricAPI 修復失敗: ${e.message}`) }
  }
  if (missingMods.includes('ClusterConnect')) {
    try {
      send('ClusterConnect を修復中...')
      const rel = await fetchJson('https://api.github.com/repos/Simohayhe/ClusterConnectFabric/releases/latest')
      // MCバージョンのメジャー.マイナーに対応するJARを選択（命名規則不問）
      const majorMinor = (mcVersion || '').match(/^(\d+\.\d+)/)?.[1]
      const allJars = (rel.assets || []).filter(a => a.name.endsWith('.jar'))
      const asset = (majorMinor && allJars.find(a => a.name.includes(majorMinor)))
        || allJars[0]
      if (asset) {
        // 古いClusterConnect JARを削除
        readdirSync(modsDir).filter(f => f.toLowerCase().includes('clusterconnect') && f.endsWith('.jar'))
          .forEach(f => { try { unlinkSync(join(modsDir, f)) } catch { /* skip */ } })
        await downloadFile(asset.browser_download_url, join(modsDir, asset.name))
        results.push('ClusterConnect')
      }
      if (forwardingSecret) writeFileSync(join(configDir, 'clusterconnect.json'), JSON.stringify({ secret_key: forwardingSecret.trim() }, null, 2), 'utf-8')
    } catch (e) { send(`ClusterConnect 修復失敗: ${e.message}`) }
  }
  send('修復完了！')
  return { success: true, repaired: results }
})

// Invsync の利用可能バージョン一覧取得（GitHub Releases）
ipcMain.handle('invsync-list-versions', async () => {
  try {
    const { net } = await import('electron')
    const fetchJson = (url) => new Promise((resolve, reject) => {
      const req = net.request({ url, headers: { 'User-Agent': 'beacon/1.0' } })
      let d = ''; req.on('response', r => { r.on('data', c => { d += c }); r.on('end', () => { try { resolve(JSON.parse(d)) } catch (e) { reject(e) } }) }); req.on('error', reject); req.end()
    })
    const releases = await fetchJson('https://api.github.com/repos/Simohayhe/Invsyncmod/releases')
    return (releases || []).map(r => ({
      tag: r.tag_name,
      // タグ名から MC バージョンを推定（例: v1.21.11 → 1.21.11）
      mcVersion: r.tag_name.replace(/^v/, ''),
      downloadUrl: (r.assets || []).find(a => a.name.endsWith('.jar'))?.browser_download_url || null,
      fileName: (r.assets || []).find(a => a.name.endsWith('.jar'))?.name || null,
    })).filter(r => r.downloadUrl)
  } catch { return [] }
})

// Invsync を指定サーバーにインストール + invsyncmod.properties を自動生成
ipcMain.handle('invsync-install', async (_, { serverDir, downloadUrl, fileName, serverName, clusterName }) => {
  try {
    const { net } = await import('electron')
    const fs = require('fs')
    const modsDir = join(serverDir, 'mods')
    const configDir = join(serverDir, 'config')
    if (!existsSync(modsDir)) mkdirSync(modsDir, { recursive: true })
    if (!existsSync(configDir)) mkdirSync(configDir, { recursive: true })

    // 既存の Invsync jar を削除してから新しいものをダウンロード
    const existing = readdirSync(modsDir).filter(f => f.toLowerCase().includes('invsync') && f.endsWith('.jar'))
    for (const f of existing) unlinkSync(join(modsDir, f))
    const destPath = join(modsDir, fileName)
    await new Promise((resolve, reject) => {
      const req = net.request(downloadUrl)
      req.on('response', r => { const file = fs.createWriteStream(destPath); r.on('data', c => file.write(c)); r.on('end', () => { file.close(); resolve() }) }); req.on('error', reject); req.end()
    })

    // invsyncmod.properties を DB 設定に合わせて自動生成
    const db = loadSettings().db || {}
    const dbName = clusterName
      ? clusterName.replace(/[^a-zA-Z0-9_]/g, '_') + '_DB'
      : 'minecraft_sync'
    const srvName = serverName || serverDir.split(/[\\/]/).pop() || 'default'
    const config = [
      `server.name=${srvName}`,
      `db.host=localhost`,
      `db.port=${db.port || 3306}`,
      `db.name=${dbName}`,
      `db.user=root`,
      `db.password=${db.password || ''}`,
      ``,
      `db.pool.max=10`,
      `db.pool.timeout=30000`,
    ].join('\n')
    writeFileSync(join(configDir, 'invsyncmod.properties'), config, 'utf-8')

    return { success: true }
  } catch (e) { return { success: false, error: e.message } }
})

// Invsync インストール状況チェック
ipcMain.handle('invsync-check', (_, { serverDir }) => {
  const modsDir = join(serverDir, 'mods')
  if (!existsSync(modsDir)) return { installed: false, fileName: null }
  const found = readdirSync(modsDir).find(f => f.toLowerCase().includes('invsync') && f.endsWith('.jar'))
  return { installed: !!found, fileName: found || null }
})

// Invsync アンインストール（jar + config 削除）
ipcMain.handle('invsync-uninstall', (_, { serverDir }) => {
  try {
    const modsDir = join(serverDir, 'mods')
    if (existsSync(modsDir)) {
      const jars = readdirSync(modsDir).filter(f => f.toLowerCase().includes('invsync') && f.endsWith('.jar'))
      for (const jar of jars) unlinkSync(join(modsDir, jar))
    }
    const configFile = join(serverDir, 'config', 'invsyncmod.properties')
    if (existsSync(configFile)) unlinkSync(configFile)
    return { success: true }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

// apply-server-mods: 必須Modはlibrary管理外でも削除しない
// ─── ライブラリフォルダ自動生成 ─────────────────────────────────────────────────

// [Loader]-[Version] 形式のModソースフォルダを自動作成・登録
ipcMain.handle('ensure-mod-source-folder', (_, { loader, version, baseDir }) => {
  const folderName = `${loader.charAt(0).toUpperCase() + loader.slice(1)}-${version}`
  const folderPath = join(baseDir, 'mods', folderName)
  if (!existsSync(folderPath)) mkdirSync(folderPath, { recursive: true })
  const data = loadData()
  if (!data.modSources) data.modSources = []
  const exists = data.modSources.some(s => s.loader === loader && s.version === version)
  if (!exists) {
    data.modSources.push({ id: Date.now().toString(), loader, version, dir: folderPath })
    saveData(data)
  }
  return { folderPath, folderName }
})

// ─── Diagnostics / Network ────────────────────────────────────────────────────

// ローカル IP 取得
ipcMain.handle('get-local-ip', () => {
  const os = require('os')
  const ifaces = os.networkInterfaces()
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address
    }
  }
  return '取得失敗'
})

// ダウンロード速度テスト（Cloudflare 5MB ファイルで計測）
ipcMain.handle('diag-speed-test', async () => {
  const { net } = await import('electron')
  const TEST_URL = 'https://speed.cloudflare.com/__down?bytes=5000000'
  const TEST_BYTES = 5_000_000
  return new Promise((resolve) => {
    const start = Date.now()
    let received = 0
    const req = net.request(TEST_URL)
    req.on('response', r => {
      r.on('data', c => { received += c.length })
      r.on('end', () => {
        const elapsed = (Date.now() - start) / 1000
        const mbps = ((received * 8) / elapsed / 1_000_000).toFixed(1)
        resolve({ success: true, mbps: parseFloat(mbps), bytes: received, seconds: elapsed.toFixed(2) })
      })
      r.on('error', () => resolve({ success: false }))
    })
    req.on('error', () => resolve({ success: false }))
    req.setTimeout(30000)
    req.end()
  })
})

// UPnP でポートを開放
ipcMain.handle('diag-upnp-open-port', async (_, { port, protocol }) => {
  return new Promise((resolve) => {
    try {
      const natUpnp = require('nat-upnp')
      const client = natUpnp.createClient()
      client.portMapping({
        public: parseInt(port),
        private: parseInt(port),
        ttl: 86400,
        protocol: (protocol || 'tcp').toUpperCase(),
        description: `Beacon-${port}`
      }, (err) => {
        client.close()
        if (err) resolve({ success: false, error: err.message })
        else resolve({ success: true })
      })
      setTimeout(() => { try { client.close() } catch { /* ignore */ }; resolve({ success: false, error: 'タイムアウト' }) }, 8000)
    } catch (e) {
      resolve({ success: false, error: e.message })
    }
  })
})

// 外部からポートが到達可能か確認（ifconfig.co 利用 - アプリを動かしているマシンのポートを外部チェック）
ipcMain.handle('diag-check-port-external', async (_, { port }) => {
  const { net } = await import('electron')
  return new Promise((resolve) => {
    // ifconfig.co/port/{port} はリクエスト元IPのポートが開放されているかを外部からTCP確認する
    const url = `https://ifconfig.co/port/${port}`
    const req = net.request({ url, headers: { 'User-Agent': 'beacon/1.0', 'Accept': 'application/json' } })
    let d = ''
    req.on('response', r => {
      r.on('data', c => { d += c })
      r.on('end', () => {
        try {
          const json = JSON.parse(d)
          // {"ip": "x.x.x.x", "port": 25565, "reachable": true/false}
          resolve({ success: true, reachable: json.reachable === true, ip: json.ip, port: json.port })
        } catch { resolve({ success: false, error: 'レスポンス解析エラー' }) }
      })
    })
    req.on('error', (e) => resolve({ success: false, error: e.message }))
    req.setTimeout(20000)
    req.end()
  })
})

// インターネット速度計測（Cloudflare 10MB ファイルDL）
ipcMain.handle('check-internet-speed', async () => {
  const { net } = await import('electron')
  return new Promise((resolve) => {
    const url = 'https://speed.cloudflare.com/__down?bytes=10000000'
    const req = net.request(url)
    let bytes = 0
    const startTime = Date.now()
    req.on('response', r => {
      r.on('data', chunk => { bytes += chunk.length })
      r.on('end', () => {
        const elapsed = (Date.now() - startTime) / 1000
        const mbps = (bytes * 8 / 1_000_000 / elapsed).toFixed(1)
        resolve({ success: true, mbps: parseFloat(mbps), bytes, elapsed: elapsed.toFixed(2) })
      })
    })
    req.on('error', e => resolve({ success: false, error: e.message }))
    req.setTimeout(30000)
    req.end()
  })
})

// UPnP ポートを閉鎖
ipcMain.handle('diag-upnp-close-port', async (_, { port, protocol }) => {
  return new Promise((resolve) => {
    try {
      const natUpnp = require('nat-upnp')
      const client = natUpnp.createClient()
      client.portUnmapping({
        public: parseInt(port),
        protocol: (protocol || 'tcp').toUpperCase()
      }, (err) => {
        client.close()
        if (err) resolve({ success: false, error: err.message })
        else resolve({ success: true })
      })
      setTimeout(() => { try { client.close() } catch { /* ignore */ }; resolve({ success: false, error: 'タイムアウト' }) }, 8000)
    } catch (e) {
      resolve({ success: false, error: e.message })
    }
  })
})

// UPnP で現在マッピングされているポート一覧を取得
ipcMain.handle('diag-upnp-list-mapped', () => {
  return new Promise((resolve) => {
    try {
      const natUpnp = require('nat-upnp')
      const client = natUpnp.createClient()
      client.getMappings({ local: false }, (err, results) => {
        client.close()
        if (err || !results) return resolve([])
        resolve(results.map(r => ({
          port: typeof r.public === 'object' ? r.public.port : r.public,
          protocol: (r.protocol || 'tcp').toLowerCase(),
          description: r.description || ''
        })))
      })
      setTimeout(() => { try { client.close() } catch { /* ignore */ }; resolve([]) }, 6000)
    } catch { resolve([]) }
  })
})

// UPnP が利用可能かどうかを確認（ルーターへの疎通テスト）
ipcMain.handle('diag-upnp-check', () => {
  return new Promise((resolve) => {
    try {
      const natUpnp = require('nat-upnp')
      const client = natUpnp.createClient()
      client.getMappings((err, results) => {
        client.close()
        if (err) resolve({ available: false, error: 'ルーターが UPnP に非対応か、無効になっています' })
        else resolve({ available: true, count: (results || []).length })
      })
      setTimeout(() => {
        try { client.close() } catch { /* ignore */ }
        resolve({ available: false, error: 'ルーターから応答がありません（UPnP未対応の可能性）' })
      }, 8000)
    } catch (e) {
      resolve({ available: false, error: e.message })
    }
  })
})

// 全サーバーのポート情報を正確に取得（velocity.toml / server.properties 直読み）
ipcMain.handle('get-all-server-ports', () => {
  const data = loadData()
  const settings = loadSettings()
  const baseDir = settings.baseDir || ''
  const result = { clusters: [], standalone: [] }

  for (const cluster of data.clusters || []) {
    // Velocity ポートは cluster.velocity.port に格納されている
    let velocityPort = cluster.velocity?.port || 25577
    // velocity.toml から直接読んでより正確な値を取得
    if (baseDir && cluster.name) {
      const tomlPath = join(baseDir, cluster.name, 'velocity', 'velocity.toml')
      if (existsSync(tomlPath)) {
        try {
          const toml = readFileSync(tomlPath, 'utf-8')
          const m = toml.match(/^bind\s*=\s*"[^:]*:(\d+)"/m)
          if (m) velocityPort = parseInt(m[1])
        } catch { /* ignore */ }
      }
    }

    const clusterResult = { id: cluster.id, name: cluster.name, velocityPort, servers: [] }

    for (const server of cluster.servers || []) {
      let port = server.port || 25565
      if (server.serverDir && existsSync(join(server.serverDir, 'server.properties'))) {
        try {
          const m = readFileSync(join(server.serverDir, 'server.properties'), 'utf-8').match(/^server-port=(\d+)$/m)
          if (m) port = parseInt(m[1])
        } catch { /* ignore */ }
      }
      clusterResult.servers.push({ id: server.id, name: server.name, port })
    }
    result.clusters.push(clusterResult)
  }

  for (const server of data.standalone || []) {
    let port = server.port || 25565
    if (server.serverDir && existsSync(join(server.serverDir, 'server.properties'))) {
      try {
        const m = readFileSync(join(server.serverDir, 'server.properties'), 'utf-8').match(/^server-port=(\d+)$/m)
        if (m) port = parseInt(m[1])
      } catch { /* ignore */ }
    }
    result.standalone.push({ id: server.id, name: server.name, port })
  }

  return result
})

// ─── OP Management ───────────────────────────────────────────────────────────

ipcMain.handle('get-ops', async (_, { serverDir }) => {
  const opsPath = join(serverDir, 'ops.json')
  if (!existsSync(opsPath)) return []
  try { return JSON.parse(readFileSync(opsPath, 'utf-8')) } catch { return [] }
})

ipcMain.handle('set-ops', async (_, { serverDir, ops }) => {
  const opsPath = join(serverDir, 'ops.json')
  try { writeFileSync(opsPath, JSON.stringify(ops, null, 2), 'utf-8'); return true } catch { return false }
})

ipcMain.handle('fetch-uuid', async (_, { username }) => {
  const { net } = await import('electron')
  return new Promise((resolve) => {
    const req = net.request(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(username)}`)
    req.setHeader('User-Agent', 'beacon/1.0')
    req.on('response', (res) => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          const raw = json.id || ''
          const uuid = raw.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5')
          resolve({ uuid, name: json.name || username })
        } catch {
          resolve({ uuid: null, name: username })
        }
      })
    })
    req.on('error', () => resolve({ uuid: null, name: username }))
    req.end()
  })
})

// ─── Config File Management ───────────────────────────────────────────────────

ipcMain.handle('list-mod-configs', async (_, { serverDir, modFilename }) => {
  const baseName = modFilename
    .replace(/\.jar$/i, '')
    .replace(/[-_](\d[\d.]*[a-z]?[\d.]*).*$/i, '')
    .replace(/[-_](fabric|forge|neoforge|quilt|paper|bukkit|velocity|spigot).*$/i, '')
    .toLowerCase()
  const CONFIG_EXTS = /\.(json|toml|yml|yaml|conf|properties|cfg)$/i
  const results = []

  const matchesBaseName = (filename) => {
    const fBase = filename.replace(CONFIG_EXTS, '').toLowerCase()
    if (fBase.includes(baseName) || baseName.includes(fBase)) return true
    // 先頭一致は baseName が 6文字以上の場合のみ
    const prefixLen = Math.max(6, Math.floor(baseName.length * 0.6))
    return baseName.length >= 6 && fBase.startsWith(baseName.substring(0, prefixLen))
  }

  // Scan config/ directory (Fabric mods, Paper plugins)
  const configDir = join(serverDir, 'config')
  if (existsSync(configDir)) {
    try {
      readdirSync(configDir)
        .filter(f => CONFIG_EXTS.test(f) && matchesBaseName(f))
        .forEach(f => results.push({ filename: f, path: join(configDir, f) }))
    } catch { /* スキャン失敗は無視 */ }
  }

  // Scan plugins/<pluginname>/ directories (Velocity plugins, Bukkit plugins)
  const pluginsDir = join(serverDir, 'plugins')
  if (existsSync(pluginsDir)) {
    try {
      const pluginDirs = readdirSync(pluginsDir, { withFileTypes: true })
        .filter(d => d.isDirectory() && d.name.toLowerCase().includes(baseName))
      for (const dir of pluginDirs) {
        const fullDir = join(pluginsDir, dir.name)
        try {
          readdirSync(fullDir)
            .filter(f => CONFIG_EXTS.test(f))
            .forEach(f => results.push({ filename: `${dir.name}/${f}`, path: join(fullDir, f) }))
        } catch { /* スキャン失敗は無視 */ }
      }
    } catch { /* スキャン失敗は無視 */ }
  }

  return results
})

ipcMain.handle('read-config-file', async (_, { filePath }) => {
  if (!existsSync(filePath)) return null
  try { return readFileSync(filePath, 'utf-8') } catch { return null }
})

ipcMain.handle('write-config-file', async (_, { filePath, content }) => {
  try { writeFileSync(filePath, content, 'utf-8'); return true } catch { return false }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ─── MariaDB Management ───────────────────────────────────────────────────────
// getDbDirs は utils.js から import

// MariaDB ダウンロード URL を REST API から取得
async function fetchMariaDbDownloadUrl() {
  const { net } = await import('electron')
  const fetchJson = (url) => new Promise((resolve, reject) => {
    const req = net.request({ url, headers: { 'User-Agent': 'beacon/1.0' } })
    let d = ''
    req.on('response', r => { r.on('data', c => { d += c }); r.on('end', () => { try { resolve(JSON.parse(d)) } catch (e) { reject(e) } }) })
    req.on('error', reject)
    req.end()
  })
  try {
    // 10.11 LTS の最新バージョンを取得
    const data = await fetchJson('https://downloads.mariadb.org/rest-api/mariadb/10.11/')
    const releases = data.releases || {}
    const versions = Object.keys(releases).sort((a, b) => {
      const ap = a.split('.').map(Number), bp = b.split('.').map(Number)
      for (let i = 0; i < 3; i++) { const d = (bp[i]||0) - (ap[i]||0); if (d !== 0) return d }
      return 0
    })
    for (const ver of versions) {
      const files = releases[ver]?.files || []
      const zipFile = files.find(f => f.package_type === 'ZIP' && f.os === 'Windows' && f.cpu === 'x86_64')
      if (zipFile?.file_download_url) return { url: zipFile.file_download_url, version: ver }
    }
  } catch { /* ignore, use fallback */ }
  return { url: 'https://downloads.mariadb.com/MariaDB/mariadb-10.11.11/winx64-packages/mariadb-10.11.11-winx64.zip', version: '10.11.11' }
}

// MariaDB インストール（DL → 展開 → 初期化 → パスワード設定）
ipcMain.handle('db-install', async (_, { baseDir, password }) => {
  const { net } = await import('electron')
  const fs = require('fs')
  const { dbBase, mariaDir, dataDir, mysqldExe } = getDbDirs(baseDir)
  const send = (msg) => mainWindow?.webContents.send('db-install-log', msg)

  try {
    mkdirSync(dbBase, { recursive: true })
    send('MariaDB のダウンロード情報を取得中...')
    const { url, version } = await fetchMariaDbDownloadUrl()
    send(`MariaDB ${version} をダウンロード中...（数分かかります）`)

    const zipPath = join(dbBase, `mariadb-${version}-winx64.zip`)
    // ダウンロード
    await new Promise((resolve, reject) => {
      const req = net.request(url)
      req.on('response', r => {
        const total = parseInt(r.headers['content-length'] || '0')
        let received = 0
        const file = fs.createWriteStream(zipPath)
        r.on('data', c => {
          file.write(c)
          received += c.length
          if (total) mainWindow?.webContents.send('db-install-progress', { percent: Math.floor(received / total * 100) })
        })
        r.on('end', () => { file.close(); resolve() })
        r.on('error', reject)
      })
      req.on('error', reject)
      req.end()
    })

    send('展開中...')
    // 一時フォルダに展開してから内部ディレクトリを丸ごと移動（renameSync を確実に1回だけ使う）
    const tempExtract = join(dbBase, '_tmp_extract')
    if (existsSync(tempExtract)) rmSync(tempExtract, { recursive: true, force: true })
    if (existsSync(mariaDir)) rmSync(mariaDir, { recursive: true, force: true })
    mkdirSync(tempExtract, { recursive: true })
    await new Promise((resolve, reject) => {
      const ps = spawn('powershell', [
        '-NoProfile', '-NonInteractive', '-Command',
        `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${tempExtract}' -Force`
      ])
      ps.on('close', code => code === 0 ? resolve() : reject(new Error('展開に失敗')))
      ps.on('error', reject)
    })
    // 展開先の内部ディレクトリ（mariadb-x.x.x-winx64）を丸ごと mariaDir へ移動
    const inner = readdirSync(tempExtract).find(n => existsSync(join(tempExtract, n, 'bin', 'mysqld.exe')))
    if (!inner) throw new Error('mysqld.exe が見つかりません')
    fs.renameSync(join(tempExtract, inner), mariaDir)
    try { rmSync(tempExtract, { recursive: true, force: true }) } catch { /* ignore */ }
    try { unlinkSync(zipPath) } catch { /* ignore */ }

    send('データベースを初期化中...')
    mkdirSync(dataDir, { recursive: true })
    await new Promise((resolve, reject) => {
      // MariaDB on Windows の正式な初期化ツール mysql_install_db.exe を優先使用
      // 存在しない場合は mysqld --initialize-insecure にフォールバック
      const installDbExe = join(mariaDir, 'bin', 'mysql_install_db.exe')
      const [initExe, initArgs] = existsSync(installDbExe)
        ? [installDbExe, [`--datadir=${dataDir}`]]
        : [join(mariaDir, 'bin', 'mysqld.exe'), [`--datadir=${dataDir}`, '--initialize-insecure', '--console']]

      const initProc = spawn(initExe, initArgs, { cwd: join(mariaDir, 'bin') })
      let output = ''
      initProc.stdout?.setEncoding('utf8'); initProc.stderr?.setEncoding('utf8')
      initProc.stdout?.on('data', d => { output += d })
      initProc.stderr?.on('data', d => { output += d })
      initProc.on('close', code => {
        if (code !== 0) reject(new Error(`初期化失敗 (code: ${code})\n${output.slice(-500)}`))
        else resolve()
      })
      initProc.on('error', (e) => reject(new Error(`初期化プロセス起動失敗: ${e.message}`)))
    })

    // 初期化直後にMariaDBを一時起動してrootパスワードを設定する
    // mysql_install_db は insecure（パスワードなし）で初期化するため、SQL で設定が必要
    if (password) {
      send('rootパスワードを設定中...')
      await new Promise(async (resolve, reject) => {
        const tempProc = spawn(mysqldExe, [
          `--datadir=${dataDir}`,
          '--port=3307',  // 既存の3306と衝突しないよう一時ポート使用
          '--bind-address=127.0.0.1',
          '--console',
          '--skip-networking=OFF'
        ], { cwd: join(mariaDir, 'bin') })
        tempProc.stdout?.setEncoding('utf8'); tempProc.stderr?.setEncoding('utf8')
        tempProc.stdout?.resume(); tempProc.stderr?.resume()

        // ポートが開くまで待機（最大20秒）
        const deadline = Date.now() + 20000
        let portOpen = false
        while (Date.now() < deadline) {
          await new Promise(r => setTimeout(r, 600))
          if (await checkDbPortOpen(3307)) { portOpen = true; break }
          if (tempProc.exitCode !== null) break
        }

        if (portOpen) {
          try {
            const mysql = require('mysql2/promise')
            // 初期化直後はrootパスワードなしで接続できる
            const conn = await mysql.createConnection({ host: '127.0.0.1', port: 3307, user: 'root', password: '' })
            await conn.execute(`ALTER USER 'root'@'localhost' IDENTIFIED BY ?`, [password])
            await conn.execute('FLUSH PRIVILEGES')
            await conn.end()
            send('rootパスワードを設定しました')
          } catch (e) {
            send(`パスワード設定警告: ${e.message}`)
          }
        } else {
          send('一時起動タイムアウト（パスワード設定をスキップ）')
        }

        try { tempProc.kill() } catch { /* ignore */ }
        await new Promise(r => setTimeout(r, 1000))
        resolve()
      })
    }

    // 設定保存
    const settings = loadSettings()
    settings.db = { installed: true, password, port: 3306, dataDir, binDir: join(mariaDir, 'bin') }
    saveSettings(settings)

    send(`MariaDB ${version} のインストール完了！`)
    mainWindow?.webContents.send('db-install-done', { success: true })
    return { success: true }
  } catch (e) {
    send(`エラー: ${e.message}`)
    mainWindow?.webContents.send('db-install-done', { success: false })
    return { success: false, error: e.message }
  }
})

// MariaDB 起動
ipcMain.handle('db-start', async (_, { baseDir }) => {
  const settings = loadSettings()
  const db = settings.db
  if (!db?.installed) return { success: false, error: 'MariaDB がインストールされていません' }
  return doStartDb(db, baseDir)
})

// MariaDB 停止
ipcMain.handle('db-stop', () => {
  if (!dbProcess) return false
  try { dbProcess.kill(); dbProcess = null } catch { /* ignore */ }
  mainWindow?.webContents.send('db-status-changed', { running: false })
  return true
})

// MariaDB 稼働状態（TCP ポートチェック + 最後のエラーを返す）
ipcMain.handle('db-status', async () => {
  const settings = loadSettings()
  const port = settings.db?.port || 3306
  const open = await checkDbPortOpen(port)
  if (!open && dbProcess) { dbProcess = null }
  if (open) dbLastError = null
  return { running: open, error: open ? null : dbLastError }
})

// MariaDB インストール確認
ipcMain.handle('db-check-install', (_, { baseDir }) => {
  const { mysqldExe } = getDbDirs(baseDir)
  const settings = loadSettings()
  return { installed: existsSync(mysqldExe), hasSettings: !!settings.db?.installed }
})

// MariaDB に root で接続するヘルパー（パスワード未設定時は空パスで接続して自動設定）
async function connectAsRoot(db) {
  const mysql = require('mysql2/promise')
  const port = db.port || 3306
  const password = db.password || ''
  try {
    return await mysql.createConnection({ host: '127.0.0.1', port, user: 'root', password })
  } catch (e) {
    if (e.code === 'ER_ACCESS_DENIED_ERROR' && password) {
      // パスワードなしで接続を試みてパスワードを設定する
      const conn = await mysql.createConnection({ host: '127.0.0.1', port, user: 'root', password: '' })
      // ALTER USER は ? プレースホルダー非対応のため escape を使用
      const escaped = conn.escape(password)
      await conn.query(`ALTER USER 'root'@'localhost' IDENTIFIED BY ${escaped}`)
      await conn.query('FLUSH PRIVILEGES')
      await conn.end()
      // 設定したパスワードで再接続
      return await mysql.createConnection({ host: '127.0.0.1', port, user: 'root', password })
    }
    throw e
  }
}

// クラスター用 DB スキーマ作成
ipcMain.handle('db-create-schema', async (_, { clusterName }) => {
  const settings = loadSettings()
  const db = settings.db
  const port = db?.port || 3306
  if (!(await checkDbPortOpen(port))) return { success: false, error: 'DB が起動していません' }
  if (!db) return { success: false, error: 'DB 設定がありません' }
  try {
    const conn = await connectAsRoot(db)
    const schemaName = `${clusterName}_DB`.replace(/[^a-zA-Z0-9_]/g, '_')
    await conn.execute(`CREATE DATABASE IF NOT EXISTS \`${schemaName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
    await conn.end()
    return { success: true, schemaName }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

// MariaDB 削除（2段階警告はUI側で実装）
ipcMain.handle('db-delete', async (_, { baseDir }) => {
  const runningServers = Object.keys(processes).filter(k => !k.startsWith('velocity-'))
  if (runningServers.length > 0) return { success: false, error: 'サーバーが起動中です' }
  if (dbProcess) {
    try { dbProcess.kill(); dbProcess = null } catch { /* ignore */ }
    await new Promise(r => setTimeout(r, 1500))
  }
  const { dbBase } = getDbDirs(baseDir)
  try {
    if (existsSync(dbBase)) rmSync(dbBase, { recursive: true, force: true })
    const settings = loadSettings()
    delete settings.db
    saveSettings(settings)
    return { success: true }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

// DB パスワード取得（設定画面向け）
ipcMain.handle('db-get-settings', () => {
  const settings = loadSettings()
  return settings.db || null
})

// MariaDB バージョン取得
ipcMain.handle('db-get-version', async () => {
  const settings = loadSettings()
  const db = settings.db
  const port = db?.port || 3306
  // 起動中ならSQLでバージョン取得
  if (await checkDbPortOpen(port)) {
    try {
      const conn = await connectAsRoot(db)
      const [rows] = await conn.query('SELECT VERSION() AS v')
      await conn.end()
      return rows[0]?.v || null
    } catch { /* fallthrough */ }
  }
  // 停止中でも mysqld --version で取得
  if (db?.binDir) {
    const mysqldExe = join(db.binDir, 'mysqld.exe')
    if (existsSync(mysqldExe)) {
      return await new Promise(resolve => {
        const proc = spawn(mysqldExe, ['--version'])
        let out = ''
        proc.stdout?.setEncoding('utf8'); proc.stderr?.setEncoding('utf8')
        proc.stdout?.on('data', d => { out += d })
        proc.stderr?.on('data', d => { out += d })
        proc.on('close', () => {
          const m = out.match(/Ver\s+([\d.]+(-MariaDB)?)/i)
          resolve(m ? m[0].replace('Ver ', '') : out.trim().split('\n')[0] || null)
        })
        proc.on('error', () => resolve(null))
      })
    }
  }
  return null
})

// アプリ再起動
ipcMain.handle('restart-app', () => {
  app.relaunch()
  app.exit(0)
})

// ─── パフォーマンス統計 ────────────────────────────────────────────────────────

// CPU計算用の履歴 { pid: { cpuMs, wallMs } }
const cpuHistory = {}

ipcMain.handle('get-process-stats', async (_, { serverIds }) => {
  const { execFile } = require('child_process')
  const os = require('os')

  // serverId → pid マッピング（起動中のみ）
  const pidEntries = serverIds
    .map(id => ({ id, pid: processes[id]?.pid }))
    .filter(e => e.pid)

  if (pidEntries.length === 0) return {}

  const pidsArg = pidEntries.map(e => e.pid).join(',')
  const script = `@(${pidsArg}) | ForEach-Object { $p = Get-Process -Id $_ -ErrorAction SilentlyContinue; if ($p) { "$_ $($p.WorkingSet64) $($p.TotalProcessorTime.TotalMilliseconds)" } }`

  const raw = await new Promise(resolve => {
    execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', script],
      { timeout: 6000 },
      (_, stdout) => resolve(stdout || ''))
  })

  const pidStats = {}
  const now = Date.now()
  const numCores = os.cpus().length
  for (const line of raw.trim().split('\n')) {
    const parts = line.trim().split(' ')
    if (parts.length < 3) continue
    const pid = parseInt(parts[0])
    const memory = parseInt(parts[1]) || 0
    const cpuTime = parseFloat(parts[2]) || 0
    let cpu = 0
    if (cpuHistory[pid]) {
      const dt = now - cpuHistory[pid].wallMs
      const dCpu = cpuTime - cpuHistory[pid].cpuMs
      if (dt > 0) cpu = Math.min(100, (dCpu / dt / numCores) * 100)
    }
    cpuHistory[pid] = { cpuMs: cpuTime, wallMs: now }
    pidStats[pid] = { memory, cpu: Math.round(cpu * 10) / 10 }
  }

  const result = {}
  for (const { id, pid } of pidEntries) {
    result[id] = pidStats[pid] || null
  }
  return result
})

// ディレクトリの合計サイズ（bytes）
ipcMain.handle('get-dir-size', (_, { dir }) => {
  if (!existsSync(dir)) return { bytes: 0 }
  let total = 0
  const walk = (d) => {
    try {
      for (const entry of readdirSync(d, { withFileTypes: true })) {
        const p = join(d, entry.name)
        if (entry.isDirectory()) walk(p)
        else {
          try { total += statSync(p).size } catch { /* skip */ }
        }
      }
    } catch { /* アクセス不可フォルダをスキップ */ }
  }
  walk(dir)
  return { bytes: total }
})

// ─── 終了ブロック: 共有設定（Invsync）ONのサーバーが起動中なら終了を阻止 ──────
app.on('before-quit', (event) => {
  const runningServerIds = Object.keys(processes).filter(k => !k.startsWith('velocity-'))

  if (runningServerIds.length > 0) {
    const data = loadData()
    const runningInvsyncServers = []

    for (const id of runningServerIds) {
      let serverDir = null, serverName = null, clusterName = null

      // クラスター内を検索
      for (const cluster of data.clusters || []) {
        const srv = (cluster.servers || []).find(s => s.id === id)
        if (srv?.serverDir) {
          serverDir = srv.serverDir; serverName = srv.name; clusterName = cluster.name
          break
        }
      }
      // スタンドアロンを検索
      if (!serverDir) {
        for (const srv of data.standalone || []) {
          if (srv.id === id && srv.serverDir) {
            serverDir = srv.serverDir; serverName = srv.name
            break
          }
        }
      }

      // Invsync jar が mods/ にあるか確認
      if (serverDir) {
        try {
          const modsDir = join(serverDir, 'mods')
          if (existsSync(modsDir)) {
            const hasInvsync = readdirSync(modsDir).some(
              f => f.toLowerCase().includes('invsync') && f.endsWith('.jar')
            )
            if (hasInvsync) runningInvsyncServers.push({ serverName, clusterName })
          }
        } catch { /* ignore */ }
      }
    }

    if (runningInvsyncServers.length > 0) {
      event.preventDefault()
      const detail = runningInvsyncServers
        .map(({ clusterName, serverName }) =>
          clusterName
            ? `・クラスター「${clusterName}」のサーバー「${serverName}」`
            : `・サーバー「${serverName}」`
        )
        .join('\n')
      dialog.showMessageBox(mainWindow, {
        type: 'warning',
        buttons: ['OK'],
        title: '終了できません',
        message: 'インベントリ共有（Invsync）が有効なサーバーが起動中のため終了できません。\nサーバーを停止してからアプリを終了してください。',
        detail
      })
      return
    }
  }

  // DBを停止してから終了
  if (dbProcess) {
    try { dbProcess.kill() } catch { /* ignore */ }
    dbProcess = null
  }
})

