import { useState, useEffect, useRef, useCallback, useMemo } from 'react'

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

// ─── Java 管理セクション ────────────────────────────────────────────────────
function JavaSection() {
  const [installations, setInstallations] = useState([])
  const [detecting, setDetecting] = useState(false)
  const [installing, setInstalling] = useState(null)
  const [installLog, setInstallLog] = useState('')
  const [installProgress, setInstallProgress] = useState(0)
  const [customPath, setCustomPath] = useState('')
  const [customValidating, setCustomValidating] = useState(false)
  const [customError, setCustomError] = useState('')
  const logRef = useRef(null)

  useEffect(() => {
    window.api.loadSettings().then(s => setInstallations(s.javaInstallations || []))
  }, [])

  useEffect(() => {
    const u1 = window.api.onJavaInstallLog(msg => {
      setInstallLog(prev => prev + msg + '\n')
      if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
    })
    const u2 = window.api.onJavaInstallProgress(({ majorVersion, percent }) => {
      if (installing === majorVersion || installing == null) setInstallProgress(percent)
    })
    const u3 = window.api.onJavaInstallDone(({ majorVersion, path }) => {
      setInstalling(null); setInstallProgress(0)
      mergeInstallation({ path, majorVersion, source: 'managed' })
    })
    return () => { u1(); u2(); u3() }
  }, [installing])

  const mergeInstallation = (entry) => {
    setInstallations(prev => {
      const next = prev.filter(i => !(i.majorVersion === entry.majorVersion && i.source === entry.source))
      next.push(entry)
      saveJavas(next)
      return next
    })
  }
  const saveJavas = (list) => {
    window.api.loadSettings().then(s => window.api.saveSettings({ ...s, javaInstallations: list }))
  }
  const handleDetect = async () => {
    setDetecting(true)
    try {
      const found = await window.api.detectJava()
      setInstallations(prev => {
        const manual = prev.filter(i => i.source === 'manual' || i.source === 'managed')
        const merged = [...manual]
        for (const f of found) {
          if (!merged.find(m => m.path.toLowerCase() === f.path.toLowerCase())) merged.push(f)
        }
        saveJavas(merged); return merged
      })
    } finally { setDetecting(false) }
  }
  const handleInstall = async (majorVersion) => {
    setInstalling(majorVersion); setInstallLog(''); setInstallProgress(0)
    await window.api.installJava({ majorVersion })
  }
  const handleAddCustomPath = async () => {
    if (!customPath.trim()) return
    setCustomValidating(true); setCustomError('')
    const result = await window.api.validateJavaPath({ path: customPath.trim() })
    setCustomValidating(false)
    if (!result.valid) { setCustomError(result.error); return }
    mergeInstallation({ path: customPath.trim(), majorVersion: result.majorVersion, source: 'manual' })
    setCustomPath('')
  }
  const handleSelectJavaExe = async () => {
    const path = await window.api.selectJavaExe()
    if (path) setCustomPath(path)
  }
  const handleRemove = async (entry) => {
    await window.api.deleteJavaInstallation({ path: entry.path, source: entry.source })
    setInstallations(prev => {
      const next = prev.filter(i => !(i.path === entry.path && i.majorVersion === entry.majorVersion))
      saveJavas(next); return next
    })
  }
  const MANAGED_VERSIONS = [25, 21, 17, 8]

  return (
    <div className="settings-section">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <div className="settings-label" style={{ marginBottom: 2 }}>Java管理</div>
          <div className="settings-description">サーバーで使用するJavaのパスを管理します</div>
        </div>
        <button className="btn btn-restart" onClick={handleDetect} disabled={detecting} style={{ minWidth: 100 }}>
          {detecting ? '検索中...' : '🔍 自動検知'}
        </button>
      </div>

      {MANAGED_VERSIONS.map(v => {
        const found = installations.filter(i => i.majorVersion === v)
        const isInstalling = installing === v
        return (
          <div key={v} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', marginBottom: 8, background: 'var(--bg-card)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: found.length > 0 ? 10 : 0 }}>
              <VersionBadge version={v} />
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{found.length > 0 ? `${found.length}件 検出済み` : '未検出'}</span>
              <div style={{ flex: 1 }} />
              {!isInstalling && (
                <button className="btn btn-restart" style={{ fontSize: 12, padding: '4px 12px' }}
                  onClick={() => handleInstall(v)} disabled={installing != null}>
                  ⬇ Adoptiumからインストール
                </button>
              )}
            </div>
            {isInstalling && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6, whiteSpace: 'pre-wrap' }}>{installLog || 'ダウンロード中...'}</div>
                <div style={{ height: 6, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{ width: `${installProgress}%`, height: '100%', background: 'linear-gradient(90deg, var(--text-accent), var(--text-accent-2))', borderRadius: 99, transition: 'width 0.3s' }} />
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>{installProgress}%</div>
              </div>
            )}
            {found.map((inst, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 6, background: 'var(--bg-section)', marginTop: 4, fontSize: 12 }}>
                <span style={{ fontSize: 10, color: 'var(--text-dim)', minWidth: 42 }}>
                  {inst.source === 'managed' ? '📦 管理' : inst.source === 'manual' ? '✏ 手動' : '🔍 自動'}
                </span>
                <span style={{ flex: 1, color: 'var(--text-muted)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inst.path}</span>
                <button onClick={() => handleRemove(inst)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', fontSize: 13, padding: '0 4px' }} title="削除">✕</button>
              </div>
            ))}
          </div>
        )
      })}

      {installations.filter(i => !MANAGED_VERSIONS.includes(i.majorVersion))
        .reduce((acc, i) => {
          const ex = acc.find(a => a.majorVersion === i.majorVersion)
          if (ex) ex.entries.push(i); else acc.push({ majorVersion: i.majorVersion, entries: [i] })
          return acc
        }, [])
        .map(group => (
          <div key={group.majorVersion} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', marginBottom: 8, background: 'var(--bg-card)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <VersionBadge version={group.majorVersion} />
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{group.entries.length}件 検出済み</span>
            </div>
            {group.entries.map((inst, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 6, background: 'var(--bg-section)', marginTop: 4, fontSize: 12 }}>
                <span style={{ fontSize: 10, color: 'var(--text-dim)', minWidth: 42 }}>
                  {inst.source === 'managed' ? '📦 管理' : inst.source === 'manual' ? '✏ 手動' : '🔍 自動'}
                </span>
                <span style={{ flex: 1, color: 'var(--text-muted)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inst.path}</span>
                <button onClick={() => handleRemove(inst)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', fontSize: 13, padding: '0 4px' }} title="削除">✕</button>
              </div>
            ))}
          </div>
        ))}

      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>手動でパスを指定</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <input className="modal-input" style={{ flex: 1 }} value={customPath}
            onChange={e => { setCustomPath(e.target.value); setCustomError('') }}
            placeholder="C:\Program Files\Eclipse Adoptium\jdk-21\bin\java.exe" />
          <button className="btn btn-restart" onClick={handleSelectJavaExe} style={{ whiteSpace: 'nowrap' }}>ファイル選択</button>
          <button className="btn btn-start" onClick={handleAddCustomPath}
            disabled={customValidating || !customPath.trim()} style={{ whiteSpace: 'nowrap' }}>
            {customValidating ? '確認中...' : '追加'}
          </button>
        </div>
        {customError && <div style={{ fontSize: 12, color: '#ef4444', marginTop: 6 }}>⚠ {customError}</div>}
      </div>

      {installations.length === 0 && (
        <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.25)', fontSize: 12, color: '#92400e' }}>
          ⚠ Javaが検出されていません。「自動検知」を押すか、Adoptiumからインストールしてください。
        </div>
      )}
    </div>
  )
}

// ─── MariaDB 管理セクション ─────────────────────────────────────────────────
function DbSection({ baseDir, needsRestart, setNeedsRestart }) {
  const [dbInstalled, setDbInstalled]   = useState(false)
  const [dbRunning, setDbRunning]       = useState(false)
  const [dbError, setDbError]           = useState(null)
  const [dbSettings, setDbSettings]     = useState(null)
  const [dbPassword, setDbPassword]     = useState('')
  const [dbInstallLog, setDbInstallLog] = useState([])
  const [dbInstalling, setDbInstalling] = useState(false)
  const [dbInstallPct, setDbInstallPct] = useState(0)
  const [showDbPassword, setShowDbPassword] = useState(false)
  const [showDel, setShowDel]           = useState(false)
  const [delStep2, setDelStep2]         = useState(false)
  const [dbVersion, setDbVersion]       = useState(null)

  const load = useCallback(async () => {
    const db = await window.api.dbGetSettings()
    setDbSettings(db)
    if (baseDir) {
      const chk = await window.api.dbCheckInstall({ baseDir })
      setDbInstalled(chk.installed || chk.hasSettings)
    }
    const st = await window.api.dbStatus()
    setDbRunning(st.running)
    if (st.running) setDbError(null)
    else if (st.error) setDbError(st.error)
    const ver = await window.api.dbGetVersion()
    setDbVersion(ver)
  }, [baseDir])

  useEffect(() => {
    load()
    const u1 = window.api.onDbStatusChanged((info) => {
      setDbRunning(info.running)
      if (info.running) setDbError(null)
      else if (info.error) setDbError(info.error)
    })
    const u2 = window.api.onDbInstallLog((msg) => setDbInstallLog(prev => [...prev, msg]))
    const u3 = window.api.onDbInstallProgress((info) => setDbInstallPct(info.percent || 0))
    const u4 = window.api.onDbInstallDone((info) => {
      setDbInstalling(false)
      if (info.success) { setDbInstalled(true); setNeedsRestart(true); load() }
    })
    return () => { u1(); u2(); u3(); u4() }
  }, [load])

  const startInstall = async () => {
    if (!baseDir) return
    const pass = dbPassword.trim() || Math.random().toString(36).slice(2, 12)
    setDbInstallLog([]); setDbInstallPct(0); setDbInstalling(true); setDbPassword(pass)
    await window.api.dbInstall({ baseDir, password: pass })
  }
  const deleteDb = async () => {
    if (!delStep2) { setDelStep2(true); return }
    const res = await window.api.dbDelete({ baseDir })
    if (res.success) {
      setDbInstalled(false); setDbRunning(false); setDbSettings(null)
      setShowDel(false); setDelStep2(false)
    } else alert(`削除失敗: ${res.error}`)
  }

  const baseDirMissing = !baseDir

  if (needsRestart) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 20, padding: '48px 24px', textAlign: 'center',
        background: 'var(--bg-card)', border: '1px solid rgba(34,197,94,0.3)',
        borderRadius: 12, marginTop: 16,
      }}>
        <div style={{ fontSize: 48 }}>✅</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
          MariaDB のインストールが完了しました
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.7 }}>
          DBを自動起動するにはアプリの再起動が必要です。<br />
          再起動してもよろしいですか？
        </div>
        <button
          className="btn btn-start"
          style={{ fontSize: 14, padding: '10px 32px' }}
          onClick={() => window.api.restartApp()}
        >
          🔄 今すぐ再起動
        </button>
        <button
          className="btn"
          style={{ fontSize: 12, color: 'var(--text-muted)' }}
          onClick={() => setNeedsRestart(false)}
        >
          後で再起動する
        </button>
      </div>
    )
  }

  return (
    <div className="settings-section">
      <div className="settings-label" style={{ marginBottom: 2 }}>🗄 MariaDB 管理</div>
      <div className="settings-description">クラスター間データ連携（Invsync）に使用するデータベース</div>

      {/* ベースdir未設定の警告 */}
      {baseDirMissing && (
        <div style={{ marginTop: 10, padding: '10px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', fontSize: 12, color: '#b91c1c' }}>
          ⚠ DBをインストールする前に「サーバーベースフォルダ」を設定してください。
        </div>
      )}

      {!dbInstalled ? (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            MariaDB をインストールすることでサーバー間のインベントリ同期が有効になります。
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 13, color: 'var(--text-2)', minWidth: 90 }}>パスワード</span>
            <input className="modal-input" style={{ width: 200 }} type="text"
              placeholder="空欄で自動生成" value={dbPassword}
              onChange={e => setDbPassword(e.target.value)}
              disabled={baseDirMissing} />
          </div>
          <div style={{ padding: '8px 12px', borderRadius: 6, background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', fontSize: 12, color: '#92400e' }}>
            ⚠ パスワードはDBインストール後に変更できません。空欄の場合は自動生成されます。
          </div>
          <div>
            <button className="btn btn-start" onClick={startInstall} disabled={dbInstalling || baseDirMissing}>
              {dbInstalling ? 'インストール中...' : '📥 MariaDB をインストール'}
            </button>
            {baseDirMissing && (
              <span style={{ marginLeft: 10, fontSize: 12, color: '#ef4444' }}>
                ※ ベースフォルダを設定してから実行してください
              </span>
            )}
          </div>
          {dbInstalling && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, height: 6, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{ width: `${dbInstallPct}%`, height: '100%', background: 'linear-gradient(90deg,var(--text-accent),var(--text-accent-2))', borderRadius: 99, transition: 'width 0.3s' }} />
              </div>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{dbInstallPct}%</span>
            </div>
          )}
          {dbInstallLog.length > 0 && (
            <div className="diag-log">
              {dbInstallLog.map((l, i) => <div key={i}>{l}</div>)}
            </div>
          )}
        </div>
      ) : (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* ステータス表示 */}
          <div style={{
            background: 'var(--bg-section)',
            border: `1px solid ${dbError ? 'rgba(239,68,68,0.35)' : 'var(--border)'}`,
            borderRadius: 8, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 4
          }}>
            {[
              ['状態', <span key="s" style={{
                color: dbRunning ? '#22c55e' : dbError ? '#ef4444' : '#6b7280', fontWeight: 700
              }}>
                {dbRunning ? '● 稼働中' : dbError ? '⚠ 起動エラー' : '● 停止中'}
              </span>],
              ['バージョン', dbVersion || '取得中...'],
              ['ホスト', `localhost:${dbSettings?.port || 3306}`],
              ['ユーザー', 'root'],
              ['パスワード', <span key="pw" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontFamily: 'monospace' }}>{showDbPassword ? (dbSettings?.password || '') : '●'.repeat(dbSettings?.password?.length || 8)}</span>
                <button onClick={() => setShowDbPassword(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 11, padding: '0 4px' }}>{showDbPassword ? '🙈 隠す' : '👁 表示'}</button>
              </span>],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', gap: 16, fontSize: 12 }}>
                <span style={{ minWidth: 80, color: 'var(--text-muted)', fontWeight: 600 }}>{k}</span>
                <span style={{ color: 'var(--text)', fontFamily: 'monospace' }}>{v}</span>
              </div>
            ))}
          </div>
          {dbError && (
            <div style={{ fontSize: 12, color: '#ef4444', padding: '8px 12px', borderRadius: 6, background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', lineHeight: 1.6, wordBreak: 'break-all' }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>⚠ DBの自動起動に失敗しました</div>
              <div style={{ color: 'var(--text-muted)', marginBottom: 6 }}>{dbError}</div>
              {(dbError.includes("doesn't exist") || dbError.includes('privilege tables') || dbError.includes('初期化')) && (
                <div style={{ color: '#b45309', background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: 4, padding: '6px 8px', marginTop: 4 }}>
                  💡 DBが正しく初期化されていません。下の「削除」ボタンでDBを削除してから、再インストールしてください。
                </div>
              )}
            </div>
          )}
          {/* アクションボタン */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '4px 0' }}>
              ※ DBはアプリ起動時に自動で起動し、終了時に自動で停止します
            </div>
            {!showDel ? (
              <button className="btn btn-delete" onClick={() => setShowDel(true)}>🗑 削除</button>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', flex: 1 }}>
                {!delStep2 ? (
                  <>
                    <span style={{ fontSize: 12, color: 'var(--text-2)' }}>データベースを削除しますか？</span>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-delete" onClick={deleteDb}>削除する</button>
                      <button className="btn btn-restart" onClick={() => setShowDel(false)}>キャンセル</button>
                    </div>
                  </>
                ) : (
                  <>
                    <span style={{ fontSize: 12, color: '#b45309', fontWeight: 600 }}>⚠ 警告：データが初期化される可能性がありますが、本当に本当によろしいですか？</span>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-delete" onClick={deleteDb}>完全に削除する</button>
                      <button className="btn btn-restart" onClick={() => { setShowDel(false); setDelStep2(false) }}>キャンセル</button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── ポート開放管理セクション ────────────────────────────────────────────────
const PORT_STATE = { UNKNOWN: 'unknown', OPEN: 'open', CLOSED: 'closed', LOADING: 'loading', ERROR: 'error' }

function PortRow({ label, port, state, onOpen, onClose }) {
  const dot = {
    [PORT_STATE.OPEN]:    { color: '#22c55e', label: '開放済み' },
    [PORT_STATE.CLOSED]:  { color: '#ef4444', label: '未開放' },
    [PORT_STATE.LOADING]: { color: 'var(--text-accent)', label: '処理中...' },
    [PORT_STATE.UNKNOWN]: { color: '#6b7280', label: '不明' },
    [PORT_STATE.ERROR]:   { color: '#f97316', label: 'エラー' },
  }[state] || { color: '#6b7280', label: '不明' }

  return (
    <div className="port-row">
      <span className="port-dot" style={{ background: dot.color, boxShadow: `0 0 5px ${dot.color}` }}
        data-loading={state === PORT_STATE.LOADING ? 'true' : undefined} />
      <span className="port-name">{label}</span>
      <span className="port-num">{port}</span>
      <span className="port-state-label" style={{ color: dot.color }}>{dot.label}</span>
      <div className="port-actions">
        {state !== PORT_STATE.OPEN
          ? <button className="diag-mini-btn" onClick={onOpen} disabled={state === PORT_STATE.LOADING}>📡 開放</button>
          : <button className="diag-mini-btn diag-mini-btn--close" onClick={onClose} disabled={state === PORT_STATE.LOADING}>✕ 閉鎖</button>}
      </div>
    </div>
  )
}

function PortSection() {
  const [allPorts, setAllPorts]       = useState(null)
  const [mappedPorts, setMappedPorts] = useState([])
  const [portStates, setPortStates]   = useState({})
  const [loadingMapped, setLoadingMapped] = useState(false)

  const loadPorts = useCallback(async () => {
    const d = await window.api.getAllServerPorts()
    setAllPorts(d)
    return d
  }, [])

  const loadMapped = useCallback(async (portsData) => {
    setLoadingMapped(true)
    const mapped = await window.api.diagUpnpListMapped()
    const openNums = mapped.map(m => m.port)
    setMappedPorts(openNums)
    setPortStates(prev => {
      const next = { ...prev }
      const src = portsData || allPorts
      if (src) {
        getFlatPorts(src).forEach(({ port }) => {
          if (next[port] === PORT_STATE.LOADING) return
          next[port] = openNums.includes(port) ? PORT_STATE.OPEN : PORT_STATE.CLOSED
        })
      }
      return next
    })
    setLoadingMapped(false)
  }, [allPorts])

  useEffect(() => {
    loadPorts().then(d => loadMapped(d))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const getFlatPorts = (d) => {
    const ports = []
    // クラスター配下のサーバーはVelocity経由のため個別ポート開放不要
    // Velocityポートのみ表示
    for (const cluster of d?.clusters || []) {
      if (cluster.velocityPort) {
        ports.push({ key: `vel-${cluster.id}`, label: `${cluster.name}  (Velocity)`, port: cluster.velocityPort, group: 'cluster' })
      }
    }
    for (const srv of d?.standalone || []) {
      if (srv.port) ports.push({ key: srv.id, label: srv.name, port: srv.port, group: 'standalone' })
    }
    return ports
  }

  const setPortState = (port, state) => setPortStates(prev => ({ ...prev, [port]: state }))

  const openPort = async (port) => {
    setPortState(port, PORT_STATE.LOADING)
    const res = await window.api.diagUpnpOpenPort({ port, protocol: 'tcp' })
    if (res.success) {
      setPortState(port, PORT_STATE.OPEN)
      setMappedPorts(prev => [...prev.filter(p => p !== port), port])
    } else {
      setPortState(port, PORT_STATE.ERROR)
    }
  }

  const closePort = async (port) => {
    setPortState(port, PORT_STATE.LOADING)
    const res = await window.api.diagUpnpClosePort({ port, protocol: 'tcp' })
    if (res.success) {
      setPortState(port, PORT_STATE.CLOSED)
      setMappedPorts(prev => prev.filter(p => p !== port))
    } else {
      setPortState(port, PORT_STATE.ERROR)
    }
  }

  if (!allPorts) return <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '8px 0' }}>読み込み中...</div>

  const flat = getFlatPorts(allPorts)
  const clusterPorts    = flat.filter(p => p.group === 'cluster')
  const standalonePorts = flat.filter(p => p.group === 'standalone')

  const renderRows = (ports) => ports.map(({ key, label, port }) => (
    <PortRow
      key={key}
      label={label}
      port={port}
      state={portStates[port] ?? PORT_STATE.UNKNOWN}
      onOpen={() => openPort(port)}
      onClose={() => closePort(port)}
    />
  ))

  return (
    <div className="settings-section">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <div>
          <div className="settings-label" style={{ marginBottom: 2 }}>🔓 ポート開放管理</div>
          <div className="settings-description">UPnP でルーターのポートを開閉できます</div>
        </div>
        <button className="btn btn-restart" onClick={() => loadMapped(null)} disabled={loadingMapped} style={{ minWidth: 110 }}>
          {loadingMapped ? '確認中...' : '🔄 状態を更新'}
        </button>
      </div>

      {flat.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '12px 0' }}>
          サーバーが登録されていません
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 12 }}>
          {clusterPorts.length > 0 && (
            <div>
              <div className="port-group-title">🔗 クラスター</div>
              <div className="port-list">{renderRows(clusterPorts)}</div>
            </div>
          )}
          {standalonePorts.length > 0 && (
            <div>
              <div className="port-group-title">🖥 スタンドアロン</div>
              <div className="port-list">{renderRows(standalonePorts)}</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── ベースフォルダ行 ────────────────────────────────────────────────────────
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

// ─── サブタブボタン ────────────────────────────────────────────────────────
function SubTab({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 18px',
        borderRadius: 8,
        border: active ? '1px solid var(--text-accent)' : '1px solid var(--border)',
        background: active ? 'rgba(var(--accent-rgb, 99,102,241),0.12)' : 'var(--bg-card)',
        color: active ? 'var(--text-accent)' : 'var(--text-muted)',
        fontWeight: active ? 700 : 400,
        fontSize: 13,
        cursor: 'pointer',
        transition: 'all 0.15s',
      }}
    >
      {children}
    </button>
  )
}

// ─── ユーティリティ（Settings内で使用） ────────────────────────────────────
function fmtBytes(bytes) {
  if (bytes == null) return '—'
  if (bytes >= 1024 ** 3) return (bytes / 1024 ** 3).toFixed(1) + ' GB'
  if (bytes >= 1024 ** 2) return (bytes / 1024 ** 2).toFixed(0) + ' MB'
  if (bytes >= 1024) return (bytes / 1024).toFixed(0) + ' KB'
  return bytes + ' B'
}

function MiniGauge({ pct, color }) {
  return (
    <div style={{ flex: 1, height: 6, borderRadius: 99, background: 'var(--bg-section)', overflow: 'hidden', minWidth: 60 }}>
      <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', borderRadius: 99, background: color, transition: 'width 0.4s' }} />
    </div>
  )
}

// ─── 全サーバー パフォーマンス一覧 ──────────────────────────────────────────
function AllPerformanceSection() {
  const [allServers, setAllServers] = useState([]) // { id, name, serverDir, type, clusterName, jvmMemory }
  const [serverStatuses, setServerStatuses] = useState({})
  const [stats, setStats] = useState({})
  const [diskSizes, setDiskSizes] = useState({})
  const [diskLoading, setDiskLoading] = useState({})
  const intervalRef = useRef(null)
  const diskTimerRef = useRef(null)
  const subscribedRef = useRef(new Set())

  const calcDisk = useCallback((servers) => {
    ;(servers || allServers).forEach(srv => {
      if (!srv.serverDir) return
      setDiskLoading(prev => ({ ...prev, [srv.id]: true }))
      window.api.getDirSize(srv.serverDir).then(({ bytes }) => {
        setDiskSizes(prev => ({ ...prev, [srv.id]: bytes }))
        setDiskLoading(prev => { const n = {...prev}; delete n[srv.id]; return n })
      })
    })
  }, [allServers])

  // 5分ごとのディスク再計算タイマー
  useEffect(() => {
    diskTimerRef.current = setInterval(() => calcDisk(), 5 * 60 * 1000)
    return () => clearInterval(diskTimerRef.current)
  }, [calcDisk])

  useEffect(() => {
    window.api.loadData().then(data => {
      const servers = [
        ...(data.standalone || []).map(s => ({ ...s, clusterName: null })),
        ...(data.clusters || []).flatMap(c => c.servers.map(s => ({ ...s, clusterName: c.name }))),
      ]
      setAllServers(servers)
      // ポートチェックで起動中を検知
      servers.forEach(async (s) => {
        if (!s.port) return
        const inUse = await window.api.checkPort({ port: s.port })
        if (inUse) setServerStatuses(prev => ({ ...prev, [s.id]: 'running' }))
      })
      // ログイベント購読（起動・停止検知）
      servers.forEach(s => {
        if (subscribedRef.current.has(s.id)) return
        subscribedRef.current.add(s.id)
        window.api.onServerStarted(s.id, () => setServerStatuses(prev => ({ ...prev, [s.id]: 'running' })))
        window.api.onServerStopped(s.id, () => setServerStatuses(prev => { const n = {...prev}; delete n[s.id]; return n }))
      })
      // ディスクサイズ計算（初回）
      calcDisk(servers)
    })
  }, [])

  // CPU / メモリ ポーリング
  useEffect(() => {
    const poll = async () => {
      const runningIds = allServers.filter(s => serverStatuses[s.id]).map(s => s.id)
      if (runningIds.length === 0) return
      const result = await window.api.getProcessStats(runningIds)
      if (result) setStats(prev => ({ ...prev, ...result }))
    }
    poll()
    intervalRef.current = setInterval(poll, 3000)
    return () => clearInterval(intervalRef.current)
  }, [allServers, serverStatuses])

  // クラスターでグループ化
  const grouped = useMemo(() => {
    const standalone = allServers.filter(s => !s.clusterName)
    const clusterMap = {}
    for (const s of allServers.filter(s => s.clusterName)) {
      if (!clusterMap[s.clusterName]) clusterMap[s.clusterName] = []
      clusterMap[s.clusterName].push(s)
    }
    return { standalone, clusters: Object.entries(clusterMap) }
  }, [allServers])

  const renderRow = (srv) => {
    const running = !!serverStatuses[srv.id]
    const s = stats[srv.id]
    const maxMem = (srv.jvmMemory?.value || 2) * (srv.jvmMemory?.unit === 'M' ? 1 : 1024) * 1024 * 1024
    const memPct = running && s ? Math.min(100, (s.memory / maxMem) * 100) : 0
    const disk = diskSizes[srv.id]

    return (
      <div key={srv.id} style={{
        display: 'grid', gridTemplateColumns: '180px 1fr 1fr 100px 80px',
        alignItems: 'center', gap: 12, padding: '10px 14px',
        borderBottom: '1px solid var(--border)',
      }}>
        {/* 名前 + 状態 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={{
            width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
            background: running ? '#22c55e' : '#6b7280',
            boxShadow: running ? '0 0 4px #22c55e' : 'none',
          }} />
          <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{srv.name}</span>
        </div>
        {/* CPU */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <MiniGauge pct={running && s ? s.cpu : 0} color="linear-gradient(90deg,#6366f1,#8b5cf6)" />
          <span style={{ fontSize: 11, color: running && s ? 'var(--text)' : 'var(--text-dim)', minWidth: 38, textAlign: 'right' }}>
            {running && s ? `${s.cpu.toFixed(1)}%` : '—'}
          </span>
        </div>
        {/* メモリ */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <MiniGauge pct={memPct} color="linear-gradient(90deg,#06b6d4,#0284c7)" />
          <span style={{ fontSize: 11, color: running && s ? 'var(--text)' : 'var(--text-dim)', minWidth: 60, textAlign: 'right' }}>
            {running && s ? fmtBytes(s.memory) : '—'}
          </span>
        </div>
        {/* ディスク */}
        <span style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'right' }}>
          {diskLoading[srv.id] ? '計算中...' : disk != null ? fmtBytes(disk) : '—'}
        </span>
        {/* タイプ */}
        <span style={{ fontSize: 11, color: 'var(--text-dim)', textAlign: 'center', background: 'var(--bg-section)', borderRadius: 99, padding: '2px 8px' }}>
          {srv.type === 'paper' ? 'Paper' : 'Fabric'}
        </span>
      </div>
    )
  }

  if (allServers.length === 0) {
    return <div style={{ color: 'var(--text-dim)', fontSize: 13, padding: 16 }}>サーバーがありません</div>
  }

  return (
    <div style={{ marginTop: 12 }}>
      {/* ヘッダー行 */}
      <div style={{
        display: 'grid', gridTemplateColumns: '180px 1fr 1fr 100px 80px',
        gap: 12, padding: '6px 14px',
        fontSize: 11, color: 'var(--text-dim)', fontWeight: 600,
        borderBottom: '2px solid var(--border)',
      }}>
        <span>サーバー名</span>
        <span>CPU</span>
        <span>メモリ</span>
        <span style={{ textAlign: 'right' }}>ディスク</span>
        <span style={{ textAlign: 'center' }}>種別</span>
      </div>

      <div style={{ background: 'var(--bg-card)', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden', marginTop: 8 }}>
        {/* クラスター */}
        {grouped.clusters.map(([clusterName, servers]) => (
          <div key={clusterName}>
            <div style={{ padding: '7px 14px', background: 'var(--bg-section)', fontSize: 11, fontWeight: 700, color: 'var(--text-accent)', borderBottom: '1px solid var(--border)' }}>
              🖧 {clusterName}
            </div>
            {servers.map(renderRow)}
          </div>
        ))}
        {/* スタンドアロン */}
        {grouped.standalone.length > 0 && (
          <div>
            {grouped.clusters.length > 0 && (
              <div style={{ padding: '7px 14px', background: 'var(--bg-section)', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
                🖥 スタンドアロン
              </div>
            )}
            {grouped.standalone.map(renderRow)}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── メインコンポーネント ────────────────────────────────────────────────────
function Settings({ initialTab = 'java' }) {
  const [baseDir, setBaseDir] = useState('')
  const [subTab, setSubTab] = useState(initialTab)
  const [needsRestart, setNeedsRestart] = useState(false)

  useEffect(() => {
    window.api.loadSettings().then(s => setBaseDir(s.baseDir || ''))
  }, [])

  const pick = async () => {
    const path = await window.api.selectFolder()
    if (!path) return
    setBaseDir(path)
    window.api.loadSettings().then(s => window.api.saveSettings({ ...s, baseDir: path }))
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

      {/* サブタブ */}
      <div style={{ display: 'flex', gap: 8, padding: '4px 0 12px 0', borderBottom: '1px solid var(--border)', marginBottom: 4 }}>
        <SubTab active={subTab === 'java'} onClick={() => setSubTab('java')}>☕ Java管理</SubTab>
        <SubTab active={subTab === 'db'} onClick={() => setSubTab('db')}>🗄 SQL / DB</SubTab>
        <SubTab active={subTab === 'port'} onClick={() => setSubTab('port')}>🔓 ポート管理</SubTab>
        <SubTab active={subTab === 'performance'} onClick={() => setSubTab('performance')}>📊 パフォーマンス</SubTab>
      </div>

      {subTab === 'java' && <JavaSection />}
      {subTab === 'db'   && <DbSection baseDir={baseDir} needsRestart={needsRestart} setNeedsRestart={setNeedsRestart} />}
      {subTab === 'port' && <PortSection />}
      {subTab === 'performance' && <AllPerformanceSection />}
    </div>
  )
}

export default Settings
