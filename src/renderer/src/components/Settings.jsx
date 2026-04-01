import { useState, useEffect, useRef, useCallback } from 'react'

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
    window.api.onJavaInstallLog(msg => {
      setInstallLog(prev => prev + msg + '\n')
      if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
    })
    window.api.onJavaInstallProgress(({ majorVersion, percent }) => {
      if (installing === majorVersion || installing == null) setInstallProgress(percent)
    })
    window.api.onJavaInstallDone(({ majorVersion, path }) => {
      setInstalling(null); setInstallProgress(0)
      mergeInstallation({ path, majorVersion, source: 'managed' })
    })
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
    const path = await window.api.selectFile()
    if (path) setCustomPath(path)
  }
  const handleRemove = (entry) => {
    setInstallations(prev => {
      const next = prev.filter(i => !(i.path === entry.path && i.majorVersion === entry.majorVersion))
      saveJavas(next); return next
    })
  }
  const MANAGED_VERSIONS = [21, 17]

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
function DbSection({ baseDir }) {
  const [dbInstalled, setDbInstalled]   = useState(false)
  const [dbRunning, setDbRunning]       = useState(false)
  const [dbSettings, setDbSettings]     = useState(null)
  const [dbPassword, setDbPassword]     = useState('')
  const [dbInstallLog, setDbInstallLog] = useState([])
  const [dbInstalling, setDbInstalling] = useState(false)
  const [dbInstallPct, setDbInstallPct] = useState(0)
  const [showDel, setShowDel]           = useState(false)
  const [delStep2, setDelStep2]         = useState(false)

  const load = useCallback(async () => {
    const db = await window.api.dbGetSettings()
    setDbSettings(db)
    if (baseDir) {
      const chk = await window.api.dbCheckInstall({ baseDir })
      setDbInstalled(chk.installed || chk.hasSettings)
    }
    const st = await window.api.dbStatus()
    setDbRunning(st.running)
  }, [baseDir])

  useEffect(() => {
    load()
    window.api.onDbStatusChanged((info) => setDbRunning(info.running))
    window.api.onDbInstallLog((msg) => setDbInstallLog(prev => [...prev, msg]))
    window.api.onDbInstallProgress((info) => setDbInstallPct(info.percent || 0))
    window.api.onDbInstallDone((info) => {
      setDbInstalling(false)
      if (info.success) { setDbInstalled(true); load() }
    })
  }, [load])

  const startInstall = async () => {
    if (!baseDir) return alert('先にベースディレクトリを設定してください')
    const pass = dbPassword.trim() || Math.random().toString(36).slice(2, 12)
    setDbInstallLog([]); setDbInstallPct(0); setDbInstalling(true); setDbPassword(pass)
    await window.api.dbInstall({ baseDir, password: pass })
  }
  const startDb = async () => { await window.api.dbStart({ baseDir }); load() }
  const stopDb  = async () => { await window.api.dbStop(); load() }
  const deleteDb = async () => {
    if (!delStep2) { setDelStep2(true); return }
    const res = await window.api.dbDelete({ baseDir })
    if (res.success) {
      setDbInstalled(false); setDbRunning(false); setDbSettings(null)
      setShowDel(false); setDelStep2(false)
    } else alert(`削除失敗: ${res.error}`)
  }

  return (
    <div className="settings-section">
      <div className="settings-label" style={{ marginBottom: 2 }}>🗄 MariaDB 管理</div>
      <div className="settings-description">クラスター間データ連携（Invsync）に使用するデータベース</div>

      {!dbInstalled ? (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            MariaDB をインストールすることでサーバー間のインベントリ同期が有効になります。
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 13, color: 'var(--text-2)', minWidth: 90 }}>パスワード</span>
            <input className="modal-input" style={{ width: 200 }} type="text"
              placeholder="空欄で自動生成" value={dbPassword}
              onChange={e => setDbPassword(e.target.value)} />
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>⚠ 設定後変更不可</span>
          </div>
          <div>
            <button className="btn btn-start" onClick={startInstall} disabled={dbInstalling || !baseDir}>
              {dbInstalling ? 'インストール中...' : '📥 MariaDB をインストール'}
            </button>
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
          <div style={{ background: 'var(--bg-section)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {[
              ['状態', <span key="s" style={{ color: dbRunning ? '#22c55e' : '#ef4444', fontWeight: 700 }}>{dbRunning ? '● 稼働中' : '● 停止中'}</span>],
              ['ホスト', `localhost:${dbSettings?.port || 3306}`],
              ['ユーザー', 'root'],
              ['パスワード', '●'.repeat(dbSettings?.password?.length || 8)],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', gap: 16, fontSize: 12 }}>
                <span style={{ minWidth: 80, color: 'var(--text-muted)', fontWeight: 600 }}>{k}</span>
                <span style={{ color: 'var(--text)', fontFamily: 'monospace' }}>{v}</span>
              </div>
            ))}
          </div>
          {/* アクションボタン */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {!dbRunning
              ? <button className="btn btn-start" onClick={startDb}>▶ 起動</button>
              : <button className="btn btn-stop" onClick={stopDb}>⏹ 停止</button>}
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

function PortRow({ label, port, state, onOpen, onClose, onExtCheck, extResult }) {
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
        <button className="diag-mini-btn" onClick={onExtCheck} disabled={state === PORT_STATE.LOADING} title="外部から到達確認">🌐</button>
      </div>
      {extResult && (
        <span className="port-ext-result" style={{ color: extResult.ok ? '#22c55e' : '#ef4444' }}>
          {extResult.ok ? '✓ 外部到達OK' : '✗ 外部到達NG'}
        </span>
      )}
    </div>
  )
}

function PortSection() {
  const [data, setData]               = useState(null)
  const [mappedPorts, setMappedPorts] = useState([])     // UPnP で開いてるポート番号の配列
  const [portStates, setPortStates]   = useState({})     // { port: PORT_STATE }
  const [extResults, setExtResults]   = useState({})     // { port: { ok: bool } }
  const [loadingMapped, setLoadingMapped] = useState(false)

  const loadData = useCallback(async () => {
    const d = await window.api.loadData()
    setData(d)
  }, [])

  const loadMapped = useCallback(async () => {
    setLoadingMapped(true)
    const mapped = await window.api.diagUpnpListMapped()
    const ports = mapped.map(m => m.port)
    setMappedPorts(ports)
    // ポート状態を一括更新
    setPortStates(prev => {
      const next = { ...prev }
      // 全既知ポートを "closed" or "open" に設定
      if (data) {
        getAllPorts(data).forEach(({ port }) => {
          if (next[port] === PORT_STATE.LOADING) return
          next[port] = ports.includes(port) ? PORT_STATE.OPEN : PORT_STATE.CLOSED
        })
      }
      return next
    })
    setLoadingMapped(false)
  }, [data])

  useEffect(() => { loadData() }, [loadData])
  useEffect(() => { if (data) loadMapped() }, [data]) // eslint-disable-line react-hooks/exhaustive-deps

  // データから全ポート一覧を生成
  const getAllPorts = (d) => {
    const ports = []
    for (const cluster of d?.clusters || []) {
      // Velocity ポート
      const vPort = cluster.velocityConfig?.port || cluster.velocityPort || 25577
      ports.push({ key: `vel-${cluster.id}`, label: `${cluster.name}  (Velocity)`, port: vPort, group: 'cluster', clusterName: cluster.name })
      for (const srv of cluster.servers || []) {
        ports.push({ key: srv.id, label: `${cluster.name}  >  ${srv.name}`, port: srv.port, group: 'cluster', clusterName: cluster.name })
      }
    }
    for (const srv of d?.standalone || []) {
      ports.push({ key: srv.id, label: srv.name, port: srv.port, group: 'standalone' })
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

  const checkExt = async (port) => {
    setPortState(port, PORT_STATE.LOADING)
    const res = await window.api.diagCheckPortExternal({ port })
    setPortState(port, mappedPorts.includes(port) ? PORT_STATE.OPEN : PORT_STATE.CLOSED)
    setExtResults(prev => ({ ...prev, [port]: { ok: res.success && res.reachable } }))
  }

  if (!data) return <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '8px 0' }}>読み込み中...</div>

  const allPorts = getAllPorts(data)
  const clusterPorts    = allPorts.filter(p => p.group === 'cluster')
  const standalonePorts = allPorts.filter(p => p.group === 'standalone')

  const renderRows = (ports) => ports.map(({ key, label, port }) => (
    <PortRow
      key={key}
      label={label}
      port={port}
      state={portStates[port] ?? PORT_STATE.UNKNOWN}
      onOpen={() => openPort(port)}
      onClose={() => closePort(port)}
      onExtCheck={() => checkExt(port)}
      extResult={extResults[port]}
    />
  ))

  return (
    <div className="settings-section">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <div>
          <div className="settings-label" style={{ marginBottom: 2 }}>🔓 ポート開放管理</div>
          <div className="settings-description">UPnP でルーターのポートを開閉できます</div>
        </div>
        <button className="btn btn-restart" onClick={loadMapped} disabled={loadingMapped} style={{ minWidth: 110 }}>
          {loadingMapped ? '確認中...' : '🔄 状態を更新'}
        </button>
      </div>

      {allPorts.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '12px 0' }}>
          サーバーが登録されていません
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 12 }}>
          {/* クラスター */}
          {clusterPorts.length > 0 && (
            <div>
              <div className="port-group-title">🔗 クラスター</div>
              <div className="port-list">{renderRows(clusterPorts)}</div>
            </div>
          )}
          {/* スタンドアロン */}
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

// ─── メインコンポーネント ────────────────────────────────────────────────────
function Settings() {
  const [baseDir, setBaseDir] = useState('')

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
      <JavaSection />
      <DbSection baseDir={baseDir} />
      <PortSection />
    </div>
  )
}

export default Settings
