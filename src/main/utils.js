import { join } from 'path'
import { existsSync, readdirSync, readFileSync } from 'fs'

export const DB_DIR_NAME = 'beacon-db'

// ─── サーバータイプ検出 ──────────────────────────────────────────────────────
export function detectServerType(serverDir) {
  if (existsSync(join(serverDir, 'paper.jar'))) return 'paper'
  if (existsSync(join(serverDir, 'bukkit.yml'))) return 'paper'
  if (existsSync(join(serverDir, 'spigot.yml'))) return 'paper'
  if (existsSync(join(serverDir, 'config', 'paper-global.yml'))) return 'paper'

  try {
    const files = readdirSync(serverDir)
    if (files.some((f) => f.endsWith('.jar') && /paper/i.test(f))) return 'paper'
  } catch { /* ignore */ }

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

  try {
    const pluginsDir = join(serverDir, 'plugins')
    if (existsSync(pluginsDir)) {
      const pluginJars = readdirSync(pluginsDir).filter((f) => f.endsWith('.jar'))
      if (pluginJars.length > 0) return 'paper'
    }
  } catch { /* ignore */ }

  if (existsSync(join(serverDir, 'fabric-server-launch.jar'))) return 'fabric'
  if (existsSync(join(serverDir, '.fabric'))) return 'fabric'

  try {
    if (existsSync(join(serverDir, 'plugins'))) return 'paper'
  } catch { /* ignore */ }

  return 'fabric'
}

// ─── Fabric MCバージョン検出 ────────────────────────────────────────────────
export function detectFabricMcVersion(serverDir) {
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

// ─── Paper MCバージョン検出 ─────────────────────────────────────────────────
export function detectPaperMcVersion(serverDir) {
  try {
    const paperJar = readdirSync(serverDir).find(f => /^paper[-_][\d.]+.*\.jar$/i.test(f))
    if (paperJar) {
      const m = paperJar.match(/^paper[-_](\d+(?:\.\d+)*)/i)
      if (m) return m[1]
    }
  } catch { /* ignore */ }
  return ''
}

// ─── DBディレクトリパス計算 ────────────────────────────────────────────────
export function getDbDirs(baseDir) {
  const dbBase    = join(baseDir, DB_DIR_NAME)
  const mariaDir  = join(dbBase, 'mariadb')
  const dataDir   = join(dbBase, 'data')
  const mysqldExe = join(mariaDir, 'bin', 'mysqld.exe')
  const mysqlExe  = join(mariaDir, 'bin', 'mysql.exe')
  return { dbBase, mariaDir, dataDir, mysqldExe, mysqlExe }
}

// ─── サーバー名導出（level-nameベース） ────────────────────────────────────
export function resolveServerName(levelName, fallbackName) {
  return (levelName && levelName !== 'world') ? levelName : fallbackName
}
