import { describe, it, expect, vi, beforeEach } from 'vitest'
import { join } from 'path'

// fs モジュールをモック（ファイルシステムへの実アクセスなし）
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
  readFileSync: vi.fn(),
}))

import { existsSync, readdirSync, readFileSync } from 'fs'
import {
  detectServerType,
  detectFabricMcVersion,
  detectPaperMcVersion,
  getDbDirs,
  resolveServerName,
  DB_DIR_NAME,
} from '../main/utils.js'

const DIR = '/srv/minecraft/server1'

beforeEach(() => {
  vi.resetAllMocks()
  // デフォルト: ファイル・ディレクトリは存在しない
  existsSync.mockReturnValue(false)
  readdirSync.mockReturnValue([])
})

// ─────────────────────────────────────────────────────────────────────────────
describe('detectServerType', () => {
  describe('Paper 判定', () => {
    it('paper.jar があれば paper', () => {
      existsSync.mockImplementation(p => p === join(DIR, 'paper.jar'))
      expect(detectServerType(DIR)).toBe('paper')
    })

    it('bukkit.yml があれば paper', () => {
      existsSync.mockImplementation(p => p === join(DIR, 'bukkit.yml'))
      expect(detectServerType(DIR)).toBe('paper')
    })

    it('spigot.yml があれば paper', () => {
      existsSync.mockImplementation(p => p === join(DIR, 'spigot.yml'))
      expect(detectServerType(DIR)).toBe('paper')
    })

    it('config/paper-global.yml があれば paper', () => {
      existsSync.mockImplementation(p => p === join(DIR, 'config', 'paper-global.yml'))
      expect(detectServerType(DIR)).toBe('paper')
    })

    it('paper-1.21.1-196.jar がディレクトリにあれば paper', () => {
      readdirSync.mockReturnValue(['paper-1.21.1-196.jar', 'server.properties'])
      expect(detectServerType(DIR)).toBe('paper')
    })

    it('Paper-1.20.jar（大文字混在）でも paper', () => {
      readdirSync.mockReturnValue(['Paper-1.20.jar'])
      expect(detectServerType(DIR)).toBe('paper')
    })

    it('plugins/ に jar があれば paper', () => {
      const pluginsDir = join(DIR, 'plugins')
      existsSync.mockImplementation(p => p === pluginsDir)
      readdirSync.mockImplementation(p => p === pluginsDir ? ['EssentialsX.jar'] : [])
      expect(detectServerType(DIR)).toBe('paper')
    })

    it('start.bat に "paper" の記述があれば paper', () => {
      const batPath = join(DIR, 'start.bat')
      existsSync.mockImplementation(p => p === batPath)
      readFileSync.mockReturnValue('java -jar paper-1.21.1.jar nogui')
      expect(detectServerType(DIR)).toBe('paper')
    })
  })

  describe('Fabric 判定', () => {
    it('fabric-server-launch.jar があれば fabric', () => {
      existsSync.mockImplementation(p => p === join(DIR, 'fabric-server-launch.jar'))
      expect(detectServerType(DIR)).toBe('fabric')
    })

    it('.fabric があれば fabric', () => {
      existsSync.mockImplementation(p => p === join(DIR, '.fabric'))
      expect(detectServerType(DIR)).toBe('fabric')
    })

    it('start.bat に "fabric" の記述があれば fabric', () => {
      const batPath = join(DIR, 'start.bat')
      existsSync.mockImplementation(p => p === batPath)
      readFileSync.mockReturnValue('java -jar fabric-server-launch.jar nogui')
      expect(detectServerType(DIR)).toBe('fabric')
    })

    it('何も判定材料がなければ fabric（デフォルト）', () => {
      expect(detectServerType(DIR)).toBe('fabric')
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('detectFabricMcVersion', () => {
  it('fabric-server-launch.properties から取得', () => {
    const propsPath = join(DIR, 'fabric-server-launch.properties')
    existsSync.mockImplementation(p => p === propsPath)
    readFileSync.mockReturnValue('fabric.gameVersion=1.21.1\nfabric.loaderVersion=0.16.0\n')
    expect(detectFabricMcVersion(DIR)).toBe('1.21.1')
  })

  it('versions/ ディレクトリから最新バージョンを取得', () => {
    const versionsDir = join(DIR, 'versions')
    existsSync.mockImplementation(p => p === versionsDir)
    readdirSync.mockReturnValue(['1.20.1', '1.21.1', '1.19.4'])
    expect(detectFabricMcVersion(DIR)).toBe('1.21.1')
  })

  it('version/ ディレクトリでも取得できる', () => {
    existsSync.mockImplementation(p => p === join(DIR, 'version'))
    readdirSync.mockReturnValue(['1.21.4'])
    expect(detectFabricMcVersion(DIR)).toBe('1.21.4')
  })

  it('複数のバージョンがある場合は最新を返す', () => {
    existsSync.mockImplementation(p => p === join(DIR, 'versions'))
    readdirSync.mockReturnValue(['1.19.2', '1.21.11', '1.20.4'])
    expect(detectFabricMcVersion(DIR)).toBe('1.21.11')
  })

  it('何も見つからなければ空文字', () => {
    expect(detectFabricMcVersion(DIR)).toBe('')
  })

  it('バージョン形式でないフォルダは無視する', () => {
    existsSync.mockImplementation(p => p === join(DIR, 'versions'))
    readdirSync.mockReturnValue(['cache', 'libs', '1.21.1'])
    expect(detectFabricMcVersion(DIR)).toBe('1.21.1')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('detectPaperMcVersion', () => {
  it('paper-1.21.1-196.jar からバージョン取得', () => {
    readdirSync.mockReturnValue(['paper-1.21.1-196.jar', 'server.properties'])
    expect(detectPaperMcVersion(DIR)).toBe('1.21.1')
  })

  it('paper_1.20.4.jar（アンダースコア区切り）でも取得', () => {
    readdirSync.mockReturnValue(['paper_1.20.4.jar'])
    expect(detectPaperMcVersion(DIR)).toBe('1.20.4')
  })

  it('Paper-1.20.jar（大文字混在）でも取得', () => {
    readdirSync.mockReturnValue(['Paper-1.20.jar'])
    expect(detectPaperMcVersion(DIR)).toBe('1.20')
  })

  it('paper jar がなければ空文字', () => {
    readdirSync.mockReturnValue(['fabric-api.jar', 'server.properties'])
    expect(detectPaperMcVersion(DIR)).toBe('')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('getDbDirs', () => {
  const BASE = 'C:\\MyServers'

  it('各パスが正しく組み立てられる', () => {
    const result = getDbDirs(BASE)
    expect(result.dbBase).toBe(join(BASE, DB_DIR_NAME))
    expect(result.mariaDir).toBe(join(BASE, DB_DIR_NAME, 'mariadb'))
    expect(result.dataDir).toBe(join(BASE, DB_DIR_NAME, 'data'))
    expect(result.mysqldExe).toBe(join(BASE, DB_DIR_NAME, 'mariadb', 'bin', 'mysqld.exe'))
    expect(result.mysqlExe).toBe(join(BASE, DB_DIR_NAME, 'mariadb', 'bin', 'mysql.exe'))
  })

  it('DB_DIR_NAME は nexus-db', () => {
    expect(DB_DIR_NAME).toBe('nexus-db')
  })

  it('baseDir が異なれば異なるパスを返す', () => {
    const a = getDbDirs('C:\\A')
    const b = getDbDirs('C:\\B')
    expect(a.dbBase).not.toBe(b.dbBase)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('resolveServerName', () => {
  it('level-name が "world" 以外ならその値を返す', () => {
    expect(resolveServerName('myWorld', 'server1')).toBe('myWorld')
    expect(resolveServerName('SurvivalWorld', 'folder')).toBe('SurvivalWorld')
  })

  it('level-name が "world"（デフォルト値）ならフォルダ名を返す', () => {
    expect(resolveServerName('world', 'server1')).toBe('server1')
  })

  it('level-name が空文字ならフォルダ名を返す', () => {
    expect(resolveServerName('', 'server1')).toBe('server1')
  })

  it('level-name が null/undefined ならフォルダ名を返す', () => {
    expect(resolveServerName(null, 'server1')).toBe('server1')
    expect(resolveServerName(undefined, 'server1')).toBe('server1')
  })

  it('日本語のワールド名も正しく返す', () => {
    expect(resolveServerName('生存サバイバル', 'folder')).toBe('生存サバイバル')
  })
})
