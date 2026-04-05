import { useState, useEffect } from 'react'
import ServerList from './components/ServerList'
import ModManager from './components/ModManager'
import Settings from './components/Settings'
import Diagnostics from './components/Diagnostics'
import './assets/main.css'

// ─── 初回セットアップ画面 ─────────────────────────────────────────────────────
function SetupScreen({ onComplete }) {
  const [suggestedPath, setSuggestedPath] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    window.api.getSuggestedBaseDir().then(setSuggestedPath)
  }, [])

  const handleCreate = async () => {
    setCreating(true)
    setError('')
    const res = await window.api.createBaseDir({ path: suggestedPath })
    if (res.success) {
      onComplete(suggestedPath)
    } else {
      setError(res.error)
      setCreating(false)
    }
  }

  const handleSelect = async () => {
    const path = await window.api.selectFolder()
    if (!path) return
    setCreating(true)
    setError('')
    const res = await window.api.createBaseDir({ path })
    if (res.success) {
      onComplete(path)
    } else {
      setError(res.error)
      setCreating(false)
    }
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      width: '100vw', height: '100vh', background: 'var(--bg)',
    }}>
      <div style={{ width: 480, padding: '48px 32px', textAlign: 'center' }}>
        <div style={{ fontSize: 56, marginBottom: 12 }}>⚡</div>
        <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', marginBottom: 8 }}>
          Beacon へようこそ
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 36, lineHeight: 1.8 }}>
          サーバーファイルを保存するフォルダを設定してください。<br />
          すべてのサーバーデータがここに保存されます。
        </div>

        {/* おすすめの場所に自動作成 */}
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 12, padding: '20px 22px', marginBottom: 14, textAlign: 'left',
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 10 }}>
            📁 おすすめの場所に自動作成
          </div>
          <div style={{
            fontFamily: 'monospace', fontSize: 12, color: 'var(--text-muted)',
            background: 'var(--bg-section)', padding: '8px 10px',
            borderRadius: 6, marginBottom: 14, wordBreak: 'break-all',
          }}>
            {suggestedPath || '読み込み中...'}
          </div>
          <button
            className="btn btn-start"
            style={{ width: '100%', padding: '10px 0', fontSize: 14 }}
            onClick={handleCreate}
            disabled={creating || !suggestedPath}
          >
            {creating ? '作成中...' : 'ここに作成する'}
          </button>
        </div>

        <div style={{ fontSize: 12, color: 'var(--text-dim)', margin: '4px 0 14px' }}>または</div>

        {/* 手動で選択 */}
        <button
          className="btn btn-restart"
          style={{ width: '100%', padding: '10px 0', fontSize: 13 }}
          onClick={handleSelect}
          disabled={creating}
        >
          🗂 既存のフォルダを選択
        </button>

        {error && (
          <div style={{ marginTop: 14, fontSize: 12, color: '#ef4444' }}>⚠ {error}</div>
        )}
      </div>
    </div>
  )
}

// ─── バージョンモーダル ─────────────────────────────────────────────────────
function VersionModal({ appVersion, updateState, updateVersion, updatePercent, onInstall, onClose }) {
  const [release, setRelease] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('https://api.github.com/repos/Simohayhe/Minecraft-Manager/releases/latest', {
      headers: { 'Accept': 'application/vnd.github.v3+json' }
    })
      .then(r => r.json())
      .then(data => { setRelease(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const isUpdateReady = updateState === 'downloaded'
  const isDownloading = updateState === 'downloading'

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520, width: '90vw' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>⚡ Beacon バージョン情報</div>
          <button className="btn" style={{ fontSize: 13, padding: '2px 10px' }} onClick={onClose}>✕</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div style={{ padding: '10px 14px', background: 'var(--bg-deep)', borderRadius: 8 }}>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>現在のバージョン</div>
            <div style={{ fontFamily: 'monospace', fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>v{appVersion}</div>
          </div>
          <div style={{ padding: '10px 14px', background: 'var(--bg-deep)', borderRadius: 8 }}>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>最新バージョン</div>
            {loading
              ? <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>確認中...</div>
              : release?.tag_name
                ? <div style={{ fontFamily: 'monospace', fontSize: 18, fontWeight: 700, color: (updateVersion || release.tag_name.replace(/^v/, '')) !== appVersion ? '#22c55e' : 'var(--text)' }}>
                    {release.tag_name}
                  </div>
                : <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>取得できませんでした</div>
            }
          </div>
        </div>

        {isDownloading && (
          <div style={{ marginBottom: 14, padding: '10px 12px', background: 'var(--bg-deep)', borderRadius: 8 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>⬇ v{updateVersion} をダウンロード中... {updatePercent}%</div>
            <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${updatePercent}%`, background: '#22c55e', transition: 'width 0.3s' }} />
            </div>
          </div>
        )}
        {isUpdateReady && (
          <div style={{ marginBottom: 14, padding: '10px 12px', background: '#14532d33', border: '1px solid #22c55e55', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, color: '#4ade80' }}>✅ v{updateVersion} の更新準備ができました</span>
            <button className="btn btn-start" style={{ fontSize: 12 }} onClick={onInstall}>今すぐ再起動して更新</button>
          </div>
        )}

        {release?.body && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>
              📋 リリースノート {release.tag_name && `(${release.tag_name})`}
            </div>
            <div style={{
              background: 'var(--bg-deep)', borderRadius: 8, padding: '10px 14px',
              maxHeight: 260, overflowY: 'auto', fontSize: 12, color: 'var(--text)', lineHeight: 1.7,
              whiteSpace: 'pre-wrap', fontFamily: 'inherit'
            }}>
              {release.body}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function App() {
  const [page, setPage] = useState('servers')
  const [dark, setDark] = useState(() => localStorage.getItem('theme') === 'dark')
  // null = ロード中, '' = 未設定(セットアップ), それ以外 = 設定済み
  const [baseDir, setBaseDir] = useState(null)

  // 自動更新: idle | available | downloading | downloaded | error
  const [updateState, setUpdateState] = useState('idle')
  const [updateVersion, setUpdateVersion] = useState('')
  const [updatePercent, setUpdatePercent] = useState(0)

  // バージョン表示
  const [appVersion, setAppVersion] = useState('')
  const [showVersionModal, setShowVersionModal] = useState(false)

  useEffect(() => {
    window.api.loadSettings()
      .then(s => setBaseDir(s.baseDir || ''))
      .catch(() => setBaseDir(''))
  }, [])

  useEffect(() => {
    window.api.getAppVersion().then(v => setAppVersion(v)).catch(() => {})
  }, [])

  useEffect(() => {
    document.querySelector('.app')?.setAttribute('data-theme', dark ? 'dark' : '')
    localStorage.setItem('theme', dark ? 'dark' : 'light')
  }, [dark])

  useEffect(() => {
    window.api.onUpdateAvailable(({ version }) => {
      setUpdateVersion(version)
      setUpdateState('downloading')
    })
    window.api.onUpdateDownloadProgress(({ percent }) => {
      setUpdatePercent(percent)
    })
    window.api.onUpdateDownloaded(({ version }) => {
      setUpdateVersion(version)
      setUpdateState('downloaded')
    })
    window.api.onUpdateError(() => {
      setUpdateState('error')
    })
  }, [])

  // ロード中
  if (baseDir === null) {
    return (
      <div className="app" data-theme={dark ? 'dark' : ''} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>読み込み中...</div>
      </div>
    )
  }

  // ベースフォルダ未設定 → セットアップ画面
  if (baseDir === '') {
    return (
      <div className="app" data-theme={dark ? 'dark' : ''}>
        <SetupScreen onComplete={(path) => setBaseDir(path)} />
      </div>
    )
  }

  return (
    <div className="app" data-theme={dark ? 'dark' : ''}>
      <div className="sidebar">
        <div className="sidebar-title">Beacon</div>
        <button
          className={`sidebar-btn ${page === 'servers' ? 'active' : ''}`}
          onClick={() => setPage('servers')}
        >
          🖧 サーバー管理
        </button>
        <button
          className={`sidebar-btn ${page === 'mods' ? 'active' : ''}`}
          onClick={() => setPage('mods')}
        >
          📦 Mod管理
        </button>
        <button
          className={`sidebar-btn ${page === 'settings' ? 'active' : ''}`}
          onClick={() => setPage('settings')}
        >
          ⚙ 設定
        </button>
        <button
          className={`sidebar-btn ${page === 'diagnostics' ? 'active' : ''}`}
          onClick={() => setPage('diagnostics')}
        >
          🔍 診断
        </button>
        <div className="sidebar-spacer" />
        <button className="theme-toggle" onClick={() => setDark((d) => !d)}>
          {dark ? '☀ ライトモード' : '🌙 ダークモード'}
        </button>
        {/* バージョンボタン */}
        <button
          onClick={() => setShowVersionModal(true)}
          title="バージョン情報・アップデート"
          style={{
            background: 'none', border: '1px solid',
            borderColor: updateState !== 'idle' ? '#22c55e' : 'var(--border)',
            cursor: 'pointer', padding: '5px 10px',
            fontSize: 11, borderRadius: 6,
            color: updateState !== 'idle' ? '#22c55e' : 'var(--text-dim)',
            fontWeight: updateState !== 'idle' ? 700 : 400,
            margin: '4px 0 4px',
            display: 'flex', alignItems: 'center', gap: 5,
            transition: 'color 0.3s, border-color 0.3s',
          }}
        >
          {updateState !== 'idle' ? '🟢' : '⚫'} {appVersion ? `v${appVersion}` : '...'}
          {updateState !== 'idle' && <span style={{ fontSize: 10, background: '#22c55e', color: '#fff', padding: '0 5px', borderRadius: 3 }}>NEW</span>}
        </button>
      </div>
      <div className="content-wrap">
        {updateState === 'downloading' && (
          <div className="update-banner update-banner--downloading">
            <span>⬇ v{updateVersion} をダウンロード中... {updatePercent}%</span>
            <div className="update-progress-bar">
              <div className="update-progress-fill" style={{ width: `${updatePercent}%` }} />
            </div>
          </div>
        )}
        {updateState === 'downloaded' && (
          <div className="update-banner update-banner--ready">
            <span>✅ v{updateVersion} の更新準備ができました</span>
            <button className="update-install-btn" onClick={() => window.api.installUpdate()}>
              今すぐ再起動して更新
            </button>
            <button className="update-dismiss-btn" onClick={() => setUpdateState('idle')}>✕</button>
          </div>
        )}
        {updateState === 'error' && (
          <div className="update-banner update-banner--error">
            <span>⚠ 更新の取得に失敗しました</span>
            <button className="update-dismiss-btn" onClick={() => setUpdateState('idle')}>✕</button>
          </div>
        )}
        <div className="content">
          {page === 'servers' && <ServerList />}
          {page === 'mods' && <ModManager />}
          {page === 'settings' && <Settings />}
          {page === 'diagnostics' && <Diagnostics />}
        </div>
      </div>
      {showVersionModal && (
        <VersionModal
          appVersion={appVersion}
          updateState={updateState}
          updateVersion={updateVersion}
          updatePercent={updatePercent}
          onInstall={() => { window.api.installUpdate(); setShowVersionModal(false) }}
          onClose={() => setShowVersionModal(false)}
        />
      )}
    </div>
  )
}

export default App
