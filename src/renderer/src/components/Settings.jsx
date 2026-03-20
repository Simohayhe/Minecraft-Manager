import { useState, useEffect, useRef } from 'react'

// Java バージョンバッジの色
const JAVA_VERSION_COLORS = {
  21: { bg: 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.3)', text: '#15803d' },
  17: { bg: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.3)', text: '#1d4ed8' },
  11: { bg: 'rgba(168,85,247,0.12)', border: 'rgba(168,85,247,0.3)', text: '#7e22ce' },
}
const defaultColor = { bg: 'rgba(100,116,139,0.1)', border: 'rgba(100,116,139,0.25)', text: '#475569' }

function VersionBadge({ version }) {
  const c = JAVA_VERSION_COLORS[version] || defaultColor
  return (
    <span style={{
      padding: '2px 10px', borderRadius: 99, fontSize: 12, fontWeight: 700,
      background: c.bg, border: `1px solid ${c.border}`, color: c.text,
    }}>
      Java {version}
    </span>
  )
}

// Java 管理セクション
function JavaSection() {
  const [installations, setInstallations] = useState([]) // { path, majorVersion, source }
  const [detecting, setDetecting] = useState(false)
  const [installing, setInstalling] = useState(null)   // インストール中のメジャーバージョン
  const [installLog, setInstallLog] = useState('')
  const [installProgress, setInstallProgress] = useState(0)
  const [customPath, setCustomPath] = useState('')
  const [customValidating, setCustomValidating] = useState(false)
  const [customError, setCustomError] = useState('')
  const logRef = useRef(null)

  // settings から読み込み
  useEffect(() => {
    window.api.loadSettings().then(s => {
      setInstallations(s.javaInstallations || [])
    })
  }, [])

  // インストールログ受信
  useEffect(() => {
    window.api.onJavaInstallLog(msg => {
      setInstallLog(prev => prev + msg + '\n')
      if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
    })
    window.api.onJavaInstallProgress(({ majorVersion, percent }) => {
      if (installing === majorVersion || installing == null) {
        setInstallProgress(percent)
      }
    })
    window.api.onJavaInstallDone(({ majorVersion, path }) => {
      setInstalling(null)
      setInstallProgress(0)
      mergeInstallation({ path, majorVersion, source: 'managed' })
    })
  }, [installing])

  const mergeInstallation = (entry) => {
    setInstallations(prev => {
      const next = prev.filter(i =>
        !(i.majorVersion === entry.majorVersion && i.source === entry.source)
      )
      next.push(entry)
      saveJavas(next)
      return next
    })
  }

  const saveJavas = (list) => {
    window.api.loadSettings().then(s => {
      window.api.saveSettings({ ...s, javaInstallations: list })
    })
  }

  const handleDetect = async () => {
    setDetecting(true)
    try {
      const found = await window.api.detectJava()
      setInstallations(prev => {
        // 手動/管理済みは保持、自動検知結果でマージ
        const manual = prev.filter(i => i.source === 'manual' || i.source === 'managed')
        const merged = [...manual]
        for (const f of found) {
          if (!merged.find(m => m.path.toLowerCase() === f.path.toLowerCase())) {
            merged.push(f)
          }
        }
        saveJavas(merged)
        return merged
      })
    } finally {
      setDetecting(false)
    }
  }

  const handleInstall = async (majorVersion) => {
    setInstalling(majorVersion)
    setInstallLog('')
    setInstallProgress(0)
    await window.api.installJava({ majorVersion })
  }

  const handleAddCustomPath = async () => {
    if (!customPath.trim()) return
    setCustomValidating(true)
    setCustomError('')
    const result = await window.api.validateJavaPath({ path: customPath.trim() })
    setCustomValidating(false)
    if (!result.valid) {
      setCustomError(result.error)
      return
    }
    mergeInstallation({ path: customPath.trim(), majorVersion: result.majorVersion, source: 'manual' })
    setCustomPath('')
  }

  const handleSelectJavaExe = async () => {
    const path = await window.api.selectFile()
    if (path) setCustomPath(path)
  }

  const handleRemove = (entry) => {
    setInstallations(prev => {
      const next = prev.filter(i => !(i.path === entry.path && i.majorVersion === entry.majorVersion))
      saveJavas(next)
      return next
    })
  }

  const getStatus = (majorVersion) => {
    const found = installations.filter(i => i.majorVersion === majorVersion)
    if (found.length === 0) return 'none'
    return 'found'
  }

  const MANAGED_VERSIONS = [21, 17]

  return (
    <div className="settings-section">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <div className="settings-label" style={{ marginBottom: 2 }}>Java管理</div>
          <div className="settings-description">サーバーで使用するJavaのパスを管理します</div>
        </div>
        <button
          className="btn btn-restart"
          onClick={handleDetect}
          disabled={detecting}
          style={{ minWidth: 100 }}
        >
          {detecting ? '検索中...' : '🔍 自動検知'}
        </button>
      </div>

      {/* 主要バージョン行 */}
      {MANAGED_VERSIONS.map(v => {
        const found = installations.filter(i => i.majorVersion === v)
        const isInstalling = installing === v
        return (
          <div key={v} style={{
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: '12px 14px',
            marginBottom: 8,
            background: 'var(--bg-card)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: found.length > 0 ? 10 : 0 }}>
              <VersionBadge version={v} />
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {found.length > 0 ? `${found.length}件 検出済み` : '未検出'}
              </span>
              <div style={{ flex: 1 }} />
              {!isInstalling && (
                <button
                  className="btn btn-restart"
                  style={{ fontSize: 12, padding: '4px 12px' }}
                  onClick={() => handleInstall(v)}
                  disabled={installing != null}
                >
                  ⬇ Adoptiumからインストール
                </button>
              )}
            </div>

            {/* インストール中プログレス */}
            {isInstalling && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6, whiteSpace: 'pre-wrap' }}>
                  {installLog || 'ダウンロード中...'}
                </div>
                <div style={{ height: 6, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{
                    width: `${installProgress}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, var(--text-accent), var(--text-accent-2))',
                    borderRadius: 99,
                    transition: 'width 0.3s',
                  }} />
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>{installProgress}%</div>
              </div>
            )}

            {/* 検出済みパス一覧 */}
            {found.map((inst, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 10px', borderRadius: 6,
                background: 'var(--bg-section)', marginTop: 4,
                fontSize: 12,
              }}>
                <span style={{ fontSize: 10, color: 'var(--text-dim)', minWidth: 42 }}>
                  {inst.source === 'managed' ? '📦 管理' : inst.source === 'manual' ? '✏ 手動' : '🔍 自動'}
                </span>
                <span style={{ flex: 1, color: 'var(--text-muted)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {inst.path}
                </span>
                <button
                  onClick={() => handleRemove(inst)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', fontSize: 13, padding: '0 4px' }}
                  title="削除"
                >✕</button>
              </div>
            ))}
          </div>
        )
      })}

      {/* その他バージョン (検出された11以外など) */}
      {installations
        .filter(i => !MANAGED_VERSIONS.includes(i.majorVersion))
        .reduce((acc, i) => {
          const existing = acc.find(a => a.majorVersion === i.majorVersion)
          if (existing) existing.entries.push(i)
          else acc.push({ majorVersion: i.majorVersion, entries: [i] })
          return acc
        }, [])
        .map(group => (
          <div key={group.majorVersion} style={{
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: '12px 14px',
            marginBottom: 8,
            background: 'var(--bg-card)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <VersionBadge version={group.majorVersion} />
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{group.entries.length}件 検出済み</span>
            </div>
            {group.entries.map((inst, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 10px', borderRadius: 6,
                background: 'var(--bg-section)', marginTop: 4, fontSize: 12,
              }}>
                <span style={{ fontSize: 10, color: 'var(--text-dim)', minWidth: 42 }}>
                  {inst.source === 'managed' ? '📦 管理' : inst.source === 'manual' ? '✏ 手動' : '🔍 自動'}
                </span>
                <span style={{ flex: 1, color: 'var(--text-muted)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {inst.path}
                </span>
                <button
                  onClick={() => handleRemove(inst)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', fontSize: 13, padding: '0 4px' }}
                  title="削除"
                >✕</button>
              </div>
            ))}
          </div>
        ))
      }

      {/* 手動パス追加 */}
      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>手動でパスを指定</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <input
            className="modal-input"
            style={{ flex: 1 }}
            value={customPath}
            onChange={e => { setCustomPath(e.target.value); setCustomError('') }}
            placeholder="C:\Program Files\Eclipse Adoptium\jdk-21\bin\java.exe"
          />
          <button className="btn btn-restart" onClick={handleSelectJavaExe} style={{ whiteSpace: 'nowrap' }}>
            ファイル選択
          </button>
          <button
            className="btn btn-start"
            onClick={handleAddCustomPath}
            disabled={customValidating || !customPath.trim()}
            style={{ whiteSpace: 'nowrap' }}
          >
            {customValidating ? '確認中...' : '追加'}
          </button>
        </div>
        {customError && (
          <div style={{ fontSize: 12, color: '#ef4444', marginTop: 6 }}>⚠ {customError}</div>
        )}
      </div>

      {getStatus(21) === 'none' && getStatus(17) === 'none' && installations.length === 0 && (
        <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.25)', fontSize: 12, color: '#92400e' }}>
          ⚠ Javaが検出されていません。「自動検知」を押すか、Adoptiumからインストールしてください。
        </div>
      )}
    </div>
  )
}

function FolderRow({ label, description, value, onSelect }) {
  return (
    <div className="settings-section">
      <div className="settings-label">{label}</div>
      <div className="settings-description">{description}</div>
      <div className="settings-row">
        <input className="modal-input" style={{ flex: 1 }} value={value} readOnly placeholder="未設定" onChange={() => {}} />
        <button className="btn btn-restart" onClick={onSelect}>フォルダ選択</button>
      </div>
    </div>
  )
}

function Settings() {
  const [baseDir, setBaseDir] = useState('')

  useEffect(() => {
    window.api.loadSettings().then(s => {
      setBaseDir(s.baseDir || '')
    })
  }, [])

  const pick = async () => {
    const path = await window.api.selectFolder()
    if (!path) return
    setBaseDir(path)
    window.api.loadSettings().then(s => {
      window.api.saveSettings({ ...s, baseDir: path })
    })
  }

  return (
    <div>
      <div className="page-title">設定</div>
      <FolderRow
        label="サーバーベースフォルダ"
        description="全サーバーが入っているフォルダを指定してください"
        value={baseDir}
        onSelect={pick}
      />
      <JavaSection />
    </div>
  )
}

export default Settings
