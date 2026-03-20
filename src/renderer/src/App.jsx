import { useState, useEffect } from 'react'
import ServerList from './components/ServerList'
import ModManager from './components/ModManager'
import Settings from './components/Settings'
import './assets/main.css'

function App() {
  const [page, setPage] = useState('servers')
  const [dark, setDark] = useState(() => localStorage.getItem('theme') === 'dark')

  // 自動更新: idle | available | downloading | downloaded | error
  const [updateState, setUpdateState] = useState('idle')
  const [updateVersion, setUpdateVersion] = useState('')
  const [updatePercent, setUpdatePercent] = useState(0)

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

  return (
    <div className="app" data-theme={dark ? 'dark' : ''}>
      <div className="sidebar">
        <div className="sidebar-title">⚡ Nexus MC</div>
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
        </div>
      </div>
    </div>
  )
}

export default App
