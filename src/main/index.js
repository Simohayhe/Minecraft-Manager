import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { autoUpdater } from 'electron-updater'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, readdirSync, unlinkSync, copyFileSync, watch } from 'fs'
import { spawn } from 'child_process'
import { createConnection } from 'net'
import icon from '../../resources/icon.png?asset'

// ─── MariaDB globals ─────────────────────────────────────────────────────────
let dbProcess = null
const DB_DIR_NAME = 'nexus-db'

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

function detectServerType(serverDir) {
  // Paper indicators (checked first - file existence)
  if (existsSync(join(serverDir, 'paper.jar'))) return 'paper'
  if (existsSync(join(serverDir, 'bukkit.yml'))) return 'paper'
  if (existsSync(join(serverDir, 'spigot.yml'))) return 'paper'
  if (existsSync(join(serverDir, 'config', 'paper-global.yml'))) return 'paper'

  // Any jar with 'paper' in name (e.g. paper-1.21.1-196.jar)
  try {
    const files = readdirSync(serverDir)
    if (files.some((f) => f.endsWith('.jar') && /paper/i.test(f))) return 'paper'
  } catch { /* ignore */ }

  // Check start.bat / start.sh for jar reference
  try {
    const bats = ['start.bat', 'start.sh']
    for (const bat of bats) {
      const p = join(serverDir, bat)
      if (existsSync(p)) {
        const content = readFileSync(p, 'utf-8')
        if (/paper/i.test(content)) return 'paper'
        if (/fabric/i.test(content)) return 'fabric'
      }
    }
  } catch { /* ignore */ }

  // plugins/ dir with jars → almost certainly Paper/Bukkit
  try {
    const pluginsDir = join(serverDir, 'plugins')
    if (existsSync(pluginsDir)) {
      const pluginJars = readdirSync(pluginsDir).filter((f) => f.endsWith('.jar'))
      if (pluginJars.length > 0) return 'paper'
    }
  } catch { /* ignore */ }

  // Fabric indicators (definitive — fabric-server-launch.jar is always present for Fabric)
  if (existsSync(join(serverDir, 'fabric-server-launch.jar'))) return 'fabric'
  if (existsSync(join(serverDir, '.fabric'))) return 'fabric'

  // plugins/ dir (even empty) → Paper/Bukkit (Fabric never creates this)
  try {
    if (existsSync(join(serverDir, 'plugins'))) return 'paper'
  } catch { /* ignore */ }

  return 'fabric'
}

// FabricサーバーのmcVersionを検出する
// 1. fabric-server-launch.properties の fabric.gameVersion
// 2. version/ または versions/ ディレクトリ内の最新バージョンフォルダ名
function detectFabricMcVersion(serverDir) {
  try {
    const launchProps = join(serverDir, 'fabric-server-launch.properties')
    if (existsSync(launchProps)) {
      const m = readFileSync(launchProps, 'utf-8').match(/fabric\.gameVersion=(.+)/)
      if (m) return m[1].trim()
    }
  } catch { /* ignore */ }

  for (const dirName of ['version', 'versions']) {
    try {
      const versionsDir = join(serverDir, dirName)
      if (!existsSync(versionsDir)) continue
      const entries = readdirSync(versionsDir).filter(f => /^\d+\.\d+/.test(f))
      if (entries.length === 0) continue
      entries.sort((a, b) => {
        const ap = a.split('.').map(n => parseInt(n) || 0)
        const bp = b.split('.').map(n => parseInt(n) || 0)
        for (let i = 0; i < Math.max(ap.length, bp.length); i++) {
          const d = (bp[i] || 0) - (ap[i] || 0)
          if (d !== 0) return d
        }
        return 0
      })
      return entries[0]
    } catch { /* ignore */ }
  }
  return ''
}

function detectPaperMcVersion(serverDir) {
  try {
    const paperJar = readdirSync(serverDir).find(f => /^paper[-_][\d.]+.*\.jar$/i.test(f))
    if (paperJar) {
      const m = paperJar.match(/^paper[-_]([\d.]+)/i)
      if (m) return m[1]
    }
  } catch { /* ignore */ }
  return ''
}

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
    title: 'Nexus MC',
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
  const proc = spawn(javaBin, [
    '-Dfile.encoding=UTF-8',
    '-Dstdout.encoding=UTF-8',
    '-Dconsole.encoding=UTF-8',
    `-Xms${memStr}`, `-Xmx${memStr}`, '-jar', jar, 'nogui'
  ], { cwd: serverDir, shell: !javaPath })
  processes[serverId] = proc
  const pids = loadPids()
  pids[serverId] = proc.pid
  savePids(pids)
  proc.stdout.setEncoding('utf8')
  proc.stderr.setEncoding('utf8')
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
  electronApp.setAppUserModelId('com.electron')
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

  ipcMain.handle('load-data', () => loadData())
  ipcMain.handle('save-data', (_, data) => { saveData(data); return true })
  ipcMain.handle('load-settings', () => loadSettings())
  ipcMain.handle('save-settings', (_, settings) => { saveSettings(settings); return true })

  ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('open-folder', (_, path) => shell.openPath(path))

  ipcMain.handle('delete-server-dir', (_, { serverDir }) => {
    if (serverDir && existsSync(serverDir)) {
      rmSync(serverDir, { recursive: true, force: true })
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
    if (dbProcess) {
      try {
        const mysql = require('mysql2/promise')
        const settings = loadSettings()
        const db = settings.db
        if (db) {
          const conn = await mysql.createConnection({
            host: '127.0.0.1', port: db.port || 3306,
            user: 'root', password: db.password
          })
          schemaName = `${clusterName}_DB`.replace(/[^a-zA-Z0-9_]/g, '_')
          await conn.execute(`CREATE DATABASE IF NOT EXISTS \`${schemaName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
          await conn.end()
        }
      } catch { /* DB未起動時は無視 */ }
    }

    return { clusterDir, velocityDir, schemaName }
  })

  ipcMain.handle('install-velocity', async (_, { velocityDir }) => {
    const { net } = await import('electron')
    const fs = require('fs')
    const send = (msg) => mainWindow.webContents.send('velocity-log', msg)

    return new Promise((resolve) => {
      send('Velocityの最新バージョンを取得中...')
      const req1 = net.request('https://api.papermc.io/v2/projects/velocity')
      let d1 = ''
      req1.on('response', (r1) => {
        r1.on('data', (c) => { d1 += c })
        r1.on('end', () => {
          let latestVersion
          try { latestVersion = JSON.parse(d1).versions.at(-1) } catch { return resolve({ success: false }) }
          send(`バージョン ${latestVersion} のビルドを取得中...`)

          const req2 = net.request(`https://api.papermc.io/v2/projects/velocity/versions/${latestVersion}/builds`)
          let d2 = ''
          req2.on('response', (r2) => {
            r2.on('data', (c) => { d2 += c })
            r2.on('end', () => {
              let latestBuild
              try { latestBuild = JSON.parse(d2).builds.at(-1).build } catch { return resolve({ success: false }) }
              const jarName = `velocity-${latestVersion}-${latestBuild}.jar`
              const dlUrl = `https://api.papermc.io/v2/projects/velocity/versions/${latestVersion}/builds/${latestBuild}/downloads/${jarName}`
              send(`Velocity ${latestVersion} (build ${latestBuild}) をダウンロード中...`)

              const jarPath = join(velocityDir, 'velocity.jar')
              const req3 = net.request(dlUrl)
              req3.on('response', (r3) => {
                const file = fs.createWriteStream(jarPath)
                r3.on('data', (c) => file.write(c))
                r3.on('end', () => {
                  file.close()
                  send('Velocityのインストール完了！')
                  resolve({ success: true, jarPath })
                })
              })
              req3.on('error', (e) => { send(`ダウンロードエラー: ${e.message}`); resolve({ success: false }) })
              req3.end()
            })
          })
          req2.on('error', (e) => { send(`ビルド取得エラー: ${e.message}`); resolve({ success: false }) })
          req2.end()
        })
      })
      req1.on('error', (e) => { send(`バージョン取得エラー: ${e.message}`); resolve({ success: false }) })
      req1.end()
    })
  })

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
    const clusterDir = join(baseDir, clusterName || 'standalone')
    const serverDir = join(clusterDir, serverName)
    if (!existsSync(serverDir)) mkdirSync(serverDir, { recursive: true })

    // Java path from settings
    const settings = loadSettings()
    const javas = settings.javaInstallations || []
    const javaEntry = javas.find(j => j.majorVersion === 21) || javas.find(j => j.majorVersion === 17) || javas[0]
    const javaBin = javaEntry ? javaEntry.path : 'java'

    const installerUrl = 'https://maven.fabricmc.net/net/fabricmc/fabric-installer/1.0.1/fabric-installer-1.0.1.jar'
    const installerPath = join(serverDir, 'fabric-installer.jar')

    return new Promise((resolve) => {
      const { net } = require('electron')
      const fs = require('fs')

      mainWindow.webContents.send('install-log', `${serverName}: インストーラーをダウンロード中...`)

      const request = net.request(installerUrl)
      request.on('response', (response) => {
        const file = fs.createWriteStream(installerPath)
        response.on('data', (chunk) => file.write(chunk))
        response.on('end', () => {
          file.close()
          mainWindow.webContents.send('install-log', `${serverName}: Fabricをインストール中...`)

          const proc = spawn(javaBin, [
            '-jar', installerPath,
            'server', '-mcversion', mcVersion,
            '-downloadMinecraft'
          ], { cwd: serverDir, shell: !javaEntry })

          proc.on('error', (err) => {
            mainWindow.webContents.send('install-log', `Javaエラー: ${err.message}\n設定でJavaパスを確認してください`)
            resolve({ success: false })
          })
          proc.stdout.on('data', (d) => mainWindow.webContents.send('install-log', d.toString()))
          proc.stderr.on('data', (d) => mainWindow.webContents.send('install-log', d.toString()))
          proc.on('close', (code) => {
            writeFileSync(join(serverDir, 'eula.txt'), 'eula=true\n')
            const launchPropsPath = join(serverDir, 'fabric-server-launch.properties')
            if (!existsSync(launchPropsPath)) {
              writeFileSync(launchPropsPath, `fabric.gameVersion=${mcVersion}\n`)
            }
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
              'online-mode': 'false',
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
            mainWindow.webContents.send('install-log', `${serverName}: インストール完了！`)
            resolve({ success: code === 0, serverDir })
          })
        })
      })
      request.on('error', (e) => {
        mainWindow.webContents.send('install-log', `エラー: ${e.message}`)
        resolve({ success: false })
      })
      request.end()
    })
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
      const req = net.request({ url, headers: { 'User-Agent': 'minecraft-manager/1.0' } })
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
      // FabricProxy-Lite
      send('FabricProxy-Lite を取得中...')
      const fpVersions = await fetchJson(`https://api.modrinth.com/v2/project/fabricproxy-lite/version?loaders=%5B%22fabric%22%5D&game_versions=%5B%22${mcVersion}%22%5D`)
      if (!fpVersions || fpVersions.length === 0) {
        send(`FabricProxy-Lite: ${mcVersion} 対応バージョンが見つかりませんでした`)
      } else {
        const fpFile = fpVersions[0].files.find(f => f.primary) || fpVersions[0].files[0]
        if (fpFile) {
          send('FabricProxy-Lite をダウンロード中...')
          await downloadFile(fpFile.url, join(modsDir, fpFile.filename))
          send('FabricProxy-Lite インストール完了！')
        }
      }

      // FabricProxy-Lite config
      const config = `[enabled]\nhackOnlineMode = false\nhackEarlySend = false\nhackMessageChain = true\ndisableTokenVerification = false\n\n[proxy]\nsecret = "${forwardingSecret}"\nallowedProxyIps = []\n`
      writeFileSync(join(configDir, 'FabricProxy-Lite.toml'), config, 'utf-8')

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
          const r = net2.request({ url: 'https://api.github.com/repos/Simohayhe/ClusterConnectFabric/releases/latest', headers: { 'User-Agent': 'nexus-mc/1.0' } })
          let d2 = ''; r.on('response', res => { res.on('data', c => { d2 += c }); res.on('end', () => { try { resolve(JSON.parse(d2)) } catch(e) { reject(e) } }) }); r.on('error', reject); r.end()
        })
        const ccAsset = (ccRelease.assets || []).find(a => a.name.endsWith('.jar'))
        if (ccAsset) {
          send(`ClusterConnect ${ccRelease.tag_name} をダウンロード中...`)
          await downloadFile(ccAsset.browser_download_url, join(modsDir, ccAsset.name))
          send('ClusterConnect インストール完了！')
        }
      } catch (e) { send(`ClusterConnect 取得失敗（スキップ）: ${e.message}`) }

      // ClusterConnect 設定ファイル
      writeFileSync(join(configDir, 'clusterconnect.json'),
        JSON.stringify({ secret_key: forwardingSecret }, null, 2), 'utf-8')

      // Invsync
      send('Invsync を取得中...')
      try {
        const { net: net3 } = await import('electron')
        const isRelease = await new Promise((resolve, reject) => {
          const r = net3.request({ url: 'https://api.github.com/repos/Simohayhe/Invsyncmod/releases/latest', headers: { 'User-Agent': 'nexus-mc/1.0' } })
          let d3 = ''; r.on('response', res => { res.on('data', c => { d3 += c }); res.on('end', () => { try { resolve(JSON.parse(d3)) } catch(e) { reject(e) } }) }); r.on('error', reject); r.end()
        })
        const isAsset = (isRelease.assets || []).find(a => a.name.endsWith('.jar'))
        if (isAsset) {
          send(`Invsync ${isRelease.tag_name} をダウンロード中...`)
          await downloadFile(isAsset.browser_download_url, join(modsDir, isAsset.name))
          send('Invsync インストール完了！')
        }
      } catch (e) { send(`Invsync 取得失敗（スキップ）: ${e.message}`) }

      // Invsync 設定ファイル（invsyncmod.properties）
      // サーバー名を server.properties の level-name から取得
      const propsPath = join(serverDir, 'server.properties')
      let serverShortName = serverDir.split(/[\\/]/).pop() || 's1'
      if (existsSync(propsPath)) {
        const content = readFileSync(propsPath, 'utf-8')
        const m = content.match(/^level-name=(.+)$/m)
        if (m) serverShortName = m[1].trim()
      }
      const dbSettings = loadSettings().db
      const invsyncConfig = [
        `server.name=${serverShortName}`,
        `db.host=localhost`,
        `db.port=${dbSettings?.port || 3306}`,
        `db.name=${serverDir.split(/[\\/]/).slice(-2, -1)[0] || 'minecraftdb1'}_DB`.replace(/[^a-zA-Z0-9_]/g, '_'),
        `db.user=root`,
        `db.password=${dbSettings?.password || ''}`,
        ``,
        `db.pool.max=10`,
        `db.pool.timeout=30000`,
      ].join('\n')
      writeFileSync(join(configDir, 'invsyncmod.properties'), invsyncConfig, 'utf-8')

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
      servers.push({ name: entry.name, port: parseInt(props['server-port']) || 25565, serverDir, type, mcVersion })
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
    const name = serverDir.split(/[\\/]/).pop()
    const type = detectServerType(serverDir)
    const mcVersion = type === 'fabric' ? detectFabricMcVersion(serverDir) : detectPaperMcVersion(serverDir)
    return { success: true, name, port, serverDir, type, mcVersion }
  })

  ipcMain.handle('start-velocity', (_, { clusterId, velocityDir }) => {
    const key = `velocity-${clusterId}`
    if (processes[key]) return false
    const proc = spawn('java', ['-Xms512M', '-Xmx512M', '-jar', 'velocity.jar'], { cwd: velocityDir, shell: true })
    processes[key] = proc
    const pids = loadPids()
    pids[key] = proc.pid
    savePids(pids)
    proc.stdout.on('data', (d) => {
      const msg = d.toString()
      mainWindow.webContents.send(`velocity-log-${clusterId}`, msg)
      if (msg.includes('Listening on')) mainWindow.webContents.send(`velocity-started-${clusterId}`)
    })
    proc.stderr.on('data', (d) => mainWindow.webContents.send(`velocity-log-${clusterId}`, d.toString()))
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

  ipcMain.handle('start-server', (_, { serverId, serverDir, serverType, jvmMemory, autoRestart, javaPath }) => {
    if (processes[serverId]) return false
    const opts = { serverDir, serverType, jvmMemory, autoRestart: autoRestart || false, javaPath: javaPath || null }
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

  ipcMain.handle('write-velocity-toml', (_, { velocityDir, servers, port, motd, maxPlayers, forwardingMode, forwardingSecret }) => {
    const modeUpper = (forwardingMode || 'modern').toUpperCase()
    const serverLines = (servers || []).map(s => `${s.name} = "127.0.0.1:${s.port}"`).join('\n')
    const tryLine = servers?.length > 0 ? `try = ["${servers[0].name}"]` : 'try = []'
    const toml = `config-version = "2.7"
bind = "0.0.0.0:${port || 25577}"
motd = "${motd || 'A Velocity Proxy'}"
show-max-players = ${maxPlayers || 500}
online-mode = false
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
login-ratelimit = 3000
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
      writeFileSync(join(velocityDir, 'forwarding.secret'), forwardingSecret, 'utf-8')
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
    const clusterDir = join(baseDir, clusterName || 'standalone')
    const serverDir = join(clusterDir, serverName)
    if (!existsSync(serverDir)) mkdirSync(serverDir, { recursive: true })
    const send = (msg) => mainWindow.webContents.send('install-log', msg)

    const fetchJson = (url) => new Promise((resolve, reject) => {
      const req = net.request({ url, headers: { 'User-Agent': 'minecraft-manager/1.0' } })
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
        'online-mode': 'false',
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
        'online-mode': 'false',
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
    if (existsSync(configPath)) {
      let content = readFileSync(configPath, 'utf-8')
      content = content
        .replace('enabled: false\n    online-mode: true\n    secret: ""',
          `enabled: true\n    online-mode: true\n    secret: "${forwardingSecret}"`)
      writeFileSync(configPath, content, 'utf-8')
    } else {
      const yaml = `_version: 30\nproxies:\n  bungee-cord:\n    online-mode: true\n  velocity:\n    enabled: true\n    online-mode: true\n    secret: "${forwardingSecret}"\n`
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
    const req = net.request({ url, headers: { 'User-Agent': 'nexus-mc/1.0 (github.com/Simohayhe/Minecraft-Manager)' } })
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
      headers: { 'User-Agent': 'nexus-mc/1.0', 'Content-Type': 'application/json' }
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
    const req = net.request({ url, headers: { 'User-Agent': 'nexus-mc/1.0' } })
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
  if (!existsSync(modsDir)) return { ok: false, missing: ['FabricAPI', 'ClusterConnect', 'Invsync'] }

  const files = readdirSync(modsDir).filter(f => f.endsWith('.jar')).map(f => f.toLowerCase())
  const hasFabricApi       = files.some(f => f.includes('fabric-api') || f.includes('fabricapi'))
  const hasClusterConnect  = files.some(f => f.includes('clusterconnect'))
  const hasInvsync         = files.some(f => f.includes('invsync'))

  const missing = []
  if (!hasFabricApi) missing.push('FabricAPI')
  if (isCluster) {
    if (!hasClusterConnect) missing.push('ClusterConnect')
    if (!hasInvsync) missing.push('Invsync')
  }
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
    const req = net.request({ url, headers: { 'User-Agent': 'nexus-mc/1.0' } })
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
      const asset = (rel.assets || []).find(a => a.name.endsWith('.jar'))
      if (asset) { await downloadFile(asset.browser_download_url, join(modsDir, asset.name)); results.push('ClusterConnect') }
      if (forwardingSecret) writeFileSync(join(configDir, 'clusterconnect.json'), JSON.stringify({ secret_key: forwardingSecret }, null, 2), 'utf-8')
    } catch (e) { send(`ClusterConnect 修復失敗: ${e.message}`) }
  }
  if (missingMods.includes('Invsync')) {
    try {
      send('Invsync を修復中...')
      const rel = await fetchJson('https://api.github.com/repos/Simohayhe/Invsyncmod/releases/latest')
      const asset = (rel.assets || []).find(a => a.name.endsWith('.jar'))
      if (asset) { await downloadFile(asset.browser_download_url, join(modsDir, asset.name)); results.push('Invsync') }
    } catch (e) { send(`Invsync 修復失敗: ${e.message}`) }
  }
  send('修復完了！')
  return { success: true, repaired: results }
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
        description: `NexusMC-${port}`
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
    const req = net.request({ url, headers: { 'User-Agent': 'nexus-mc/1.0', 'Accept': 'application/json' } })
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
        if (err) resolve({ available: false, error: err.message })
        else resolve({ available: true, mappingCount: (results || []).length })
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
    req.setHeader('User-Agent', 'NexusMC/1.0')
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

function getDbDirs(baseDir) {
  const dbBase   = join(baseDir, DB_DIR_NAME)
  const mariaDir = join(dbBase, 'mariadb')   // binaries
  const dataDir  = join(dbBase, 'data')       // data directory
  const mysqldExe = join(mariaDir, 'bin', 'mysqld.exe')
  const mysqlExe  = join(mariaDir, 'bin', 'mysql.exe')
  return { dbBase, mariaDir, dataDir, mysqldExe, mysqlExe }
}

// MariaDB ダウンロード URL を REST API から取得
async function fetchMariaDbDownloadUrl() {
  const { net } = await import('electron')
  const fetchJson = (url) => new Promise((resolve, reject) => {
    const req = net.request({ url, headers: { 'User-Agent': 'nexus-mc/1.0' } })
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
    if (existsSync(mariaDir)) rmSync(mariaDir, { recursive: true, force: true })
    mkdirSync(mariaDir, { recursive: true })
    await new Promise((resolve, reject) => {
      const ps = spawn('powershell', [
        '-NoProfile', '-NonInteractive', '-Command',
        `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${mariaDir}' -Force`
      ])
      ps.on('close', code => code === 0 ? resolve() : reject(new Error('展開に失敗')))
      ps.on('error', reject)
    })
    // 展開後のサブフォルダを mariaDir 直下に移動（mariadb-x.x.x-winx64/bin/mysqld.exe → mariaDir/bin/mysqld.exe）
    const inner = readdirSync(mariaDir).find(n => existsSync(join(mariaDir, n, 'bin', 'mysqld.exe')))
    if (!inner) throw new Error('mysqld.exe が見つかりません')
    const innerPath = join(mariaDir, inner)
    for (const entry of readdirSync(innerPath)) {
      const src = join(innerPath, entry), dst = join(mariaDir, entry)
      if (!existsSync(dst)) {
        try { fs.renameSync(src, dst) } catch { /* ignore */ }
      }
    }
    try { rmSync(innerPath, { recursive: true, force: true }) } catch { /* ignore */ }
    try { unlinkSync(zipPath) } catch { /* ignore */ }

    send('データベースを初期化中...')
    mkdirSync(dataDir, { recursive: true })
    await new Promise((resolve, reject) => {
      const initProc = spawn(join(mariaDir, 'bin', 'mysqld.exe'), [
        `--datadir=${dataDir}`,
        '--initialize-insecure',
        '--user=root'
      ], { cwd: join(mariaDir, 'bin') })
      initProc.on('close', code => resolve(code))
      initProc.on('error', reject)
    })

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
  if (dbProcess) return { success: true, alreadyRunning: true }
  const settings = loadSettings()
  const db = settings.db
  if (!db?.installed) return { success: false, error: 'MariaDB がインストールされていません' }

  const { dataDir, mysqldExe } = getDbDirs(baseDir)
  const binDir = db.binDir || join(baseDir, DB_DIR_NAME, 'mariadb', 'bin')
  const exe = existsSync(mysqldExe) ? mysqldExe : join(binDir, 'mysqld.exe')

  return new Promise((resolve) => {
    const proc = spawn(exe, [
      `--datadir=${db.dataDir || dataDir}`,
      `--port=${db.port || 3306}`,
      '--bind-address=127.0.0.1',
      '--console'
    ], { cwd: binDir })
    dbProcess = proc
    let started = false
    const checkReady = (msg) => {
      if (!started && (msg.includes('ready for connections') || msg.includes('socket created'))) {
        started = true
        mainWindow?.webContents.send('db-status-changed', { running: true })
        resolve({ success: true })
      }
    }
    proc.stdout.setEncoding('utf8'); proc.stderr.setEncoding('utf8')
    proc.stdout.on('data', checkReady); proc.stderr.on('data', checkReady)
    proc.on('close', () => {
      dbProcess = null
      mainWindow?.webContents.send('db-status-changed', { running: false })
    })
    proc.on('error', (e) => {
      dbProcess = null
      if (!started) resolve({ success: false, error: e.message })
    })
    // 10秒でタイムアウト（起動完了メッセージが来なくても続行）
    setTimeout(() => {
      if (!started) { started = true; resolve({ success: true, timedOut: true }) }
    }, 10000)
  })
})

// MariaDB 停止
ipcMain.handle('db-stop', () => {
  if (!dbProcess) return false
  try { dbProcess.kill(); dbProcess = null } catch { /* ignore */ }
  mainWindow?.webContents.send('db-status-changed', { running: false })
  return true
})

// MariaDB 稼働状態
ipcMain.handle('db-status', () => ({ running: !!dbProcess }))

// MariaDB インストール確認
ipcMain.handle('db-check-install', (_, { baseDir }) => {
  const { mysqldExe } = getDbDirs(baseDir)
  const settings = loadSettings()
  return { installed: existsSync(mysqldExe), hasSettings: !!settings.db?.installed }
})

// クラスター用 DB スキーマ作成
ipcMain.handle('db-create-schema', async (_, { clusterName }) => {
  if (!dbProcess) return { success: false, error: 'DB が起動していません' }
  const settings = loadSettings()
  const db = settings.db
  if (!db) return { success: false, error: 'DB 設定がありません' }
  try {
    const mysql = require('mysql2/promise')
    const conn = await mysql.createConnection({
      host: '127.0.0.1', port: db.port || 3306,
      user: 'root', password: db.password
    })
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

// ─── 終了ブロック: DBが動いていてサーバーが起動中なら終了を阻止 ───────────────
app.on('before-quit', (event) => {
  if (!dbProcess) return
  const runningServerIds = Object.keys(processes).filter(k => !k.startsWith('velocity-'))
  if (runningServerIds.length === 0) {
    // DBを先に停止してから終了
    if (dbProcess) {
      try { dbProcess.kill() } catch { /* ignore */ }
      dbProcess = null
    }
    return
  }
  event.preventDefault()
  const data = loadData()
  const names = runningServerIds.map(id => {
    for (const cluster of data.clusters || []) {
      const srv = (cluster.servers || []).find(s => s.id === id)
      if (srv) return `${cluster.name} > ${srv.name}`
    }
    for (const sv of data.standalone || []) {
      if (sv.id === id) return sv.name
    }
    return id
  })
  dialog.showMessageBox(mainWindow, {
    type: 'warning',
    buttons: ['OK'],
    title: '終了できません',
    message: '起動中のサーバーがあるため終了できません',
    detail: names.map(n => `・${n}`).join('\n')
  })
})

