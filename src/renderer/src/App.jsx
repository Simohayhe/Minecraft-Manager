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

function App() {
  const [page, setPage] = useState('servers')
  const [dark, setDark] = useState(() => localStorage.getItem('theme') === 'dark')
  // null = ロード中, '' = 未設定(セットアップ), それ以外 = 設定済み
  const [baseDir, setBaseDir] = useState(null)

  // 自動更新: idle | available | downloading | downloaded | error
  const [updateState, setUpdateState] = useState('idle')
  const [updateVersion, setUpdateVersion] = useState('')
  const [updatePercent, setUpdatePercent] = useState(0)

  useEffect(() => {
    window.api.loadSettings()
      .then(s => setBaseDir(s.baseDir || ''))
      .catch(() => setBaseDir(''))
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
    </div>
  )
}

export default App
