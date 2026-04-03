import { useState, useEffect, useCallback } from 'react'

const STATUS = { IDLE: 'idle', OK: 'ok', WARN: 'warn', ERROR: 'error', LOADING: 'loading' }

function Signal({ status, label, children }) {
  const colors = {
    [STATUS.IDLE]:    { bg: 'var(--bg-section)', dot: '#6b7280', border: 'var(--border)' },
    [STATUS.OK]:      { bg: 'rgba(34,197,94,0.08)',  dot: '#22c55e', border: 'rgba(34,197,94,0.3)' },
    [STATUS.WARN]:    { bg: 'rgba(234,179,8,0.08)',  dot: '#eab308', border: 'rgba(234,179,8,0.3)' },
    [STATUS.ERROR]:   { bg: 'rgba(239,68,68,0.1)',   dot: '#ef4444', border: 'rgba(239,68,68,0.35)' },
    [STATUS.LOADING]: { bg: 'rgba(65,90,200,0.06)',  dot: 'var(--text-accent)', border: 'var(--border-strong)' },
  }
  const c = colors[status] || colors[STATUS.IDLE]
  return (
    <div className="diag-signal-row" style={{ background: c.bg, borderColor: c.border }}>
      <span className="diag-signal-dot" style={{ background: c.dot, boxShadow: `0 0 6px ${c.dot}` }}
        data-loading={status === STATUS.LOADING ? 'true' : undefined} />
      <span className="diag-signal-label" style={{ color: status === STATUS.ERROR ? '#ef4444' : undefined }}>{label}</span>
      {children}
    </div>
  )
}

function CopyBtn({ text }) {
  const [copied, setCopied] = useState(false)
  const copy = () => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500) }
  return <button className="diag-copy-btn" onClick={copy}>{copied ? '✓' : 'コピー'}</button>
}

// ─── ポート開放チェックセクション ────────────────────────────────────────────
function PortCheckSection({ globalIp, allPorts }) {
  const [ip, setIp] = useState('')
  const [portMode, setPortMode] = useState('custom') // 'custom' | serverId
  const [customPort, setCustomPort] = useState('')
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState(null) // { reachable, ip, port } | { error }

  useEffect(() => {
    if (globalIp && globalIp !== '取得中...' && globalIp !== '取得失敗') {
      setIp(globalIp)
    }
  }, [globalIp])

  // フラットなポート一覧
  const flatPorts = []
  for (const c of allPorts?.clusters || []) {
    if (c.velocityPort) flatPorts.push({ id: `vel-${c.id}`, label: `${c.name} (Velocity)`, port: c.velocityPort })
    for (const s of c.servers || []) {
      if (s.port) flatPorts.push({ id: s.id, label: `${c.name} > ${s.name}`, port: s.port })
    }
  }
  for (const s of allPorts?.standalone || []) {
    if (s.port) flatPorts.push({ id: s.id, label: s.name, port: s.port })
  }

  const resolvedPort = portMode === 'custom'
    ? parseInt(customPort) || null
    : flatPorts.find(p => p.id === portMode)?.port || null

  const resetIp = async () => {
    setIp('取得中...')
    const gip = await window.api.fetchGlobalIp()
    setIp(gip)
  }

  const checkPort = async () => {
    if (!resolvedPort || !ip.trim()) return
    setChecking(true)
    setResult(null)
    const res = await window.api.diagCheckPortExternal({ port: resolvedPort })
    setResult(res)
    setChecking(false)
  }

  return (
    <div className="diag-card">
      <div className="diag-card-title">🔌 ポート開放チェック</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* IP 入力 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 70 }}>IPアドレス</span>
          <input
            className="modal-input"
            style={{ flex: 1 }}
            value={ip}
            onChange={e => setIp(e.target.value)}
            placeholder="グローバルIPアドレス"
          />
          <button className="btn btn-restart" style={{ fontSize: 12, whiteSpace: 'nowrap' }} onClick={resetIp}>
            デフォルトに戻す
          </button>
        </div>

        {/* ポート選択 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 70 }}>ポート</span>
          <select
            className="modal-input"
            style={{ flex: 1 }}
            value={portMode}
            onChange={e => setPortMode(e.target.value)}
          >
            <option value="custom">手動入力</option>
            {flatPorts.map(p => (
              <option key={p.id} value={p.id}>{p.label} ({p.port})</option>
            ))}
          </select>
          {portMode === 'custom' && (
            <input
              className="modal-input"
              style={{ width: 100 }}
              type="number"
              value={customPort}
              onChange={e => setCustomPort(e.target.value)}
              placeholder="25565"
            />
          )}
        </div>

        {/* チェックボタン */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            className="btn btn-start"
            onClick={checkPort}
            disabled={checking || !resolvedPort || !ip.trim()}
            style={{ fontSize: 12 }}
          >
            {checking ? '確認中...' : '🔍 開放チェック'}
          </button>
          {resolvedPort && ip && (
            <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
              {ip}:{resolvedPort}
            </span>
          )}
        </div>

        {/* 結果 */}
        {result && (
          <div style={{
            padding: '10px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
            background: result.success && result.reachable ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
            border: `1px solid ${result.success && result.reachable ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.25)'}`,
            color: result.success && result.reachable ? '#15803d' : '#b91c1c',
          }}>
            {!result.success
              ? `⚠ チェック失敗: ${result.error}`
              : result.reachable
                ? `✅ ポート ${result.port} は外部から到達可能です`
                : `❌ ポート ${result.port} は外部から到達できません（ファイアウォールまたはルーターの設定を確認してください）`
            }
          </div>
        )}
      </div>
    </div>
  )
}

// ─── 回線速度計測セクション ──────────────────────────────────────────────────
function SpeedSection() {
  const [status, setStatus] = useState('idle') // 'idle' | 'running' | 'done' | 'error'
  const [result, setResult] = useState(null)

  const measure = async () => {
    setStatus('running')
    setResult(null)
    const res = await window.api.checkInternetSpeed()
    setResult(res)
    setStatus(res.success ? 'done' : 'error')
  }

  const speedColor = (mbps) => {
    if (mbps >= 100) return '#22c55e'
    if (mbps >= 30) return '#eab308'
    return '#ef4444'
  }

  return (
    <div className="diag-card">
      <div className="diag-card-title">📡 回線速度</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <button
          className="btn btn-restart"
          onClick={measure}
          disabled={status === 'running'}
          style={{ fontSize: 12 }}
        >
          {status === 'running' ? '計測中...' : '⚡ 速度を計測'}
        </button>
        {status === 'running' && (
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>約30秒かかる場合があります</span>
        )}
        {status === 'done' && result?.success && (
          <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
            <span style={{ fontSize: 22, fontWeight: 700, color: speedColor(result.mbps) }}>
              {result.mbps} <span style={{ fontSize: 14 }}>Mbps</span>
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
              {(result.bytes / 1_000_000).toFixed(1)} MB / {result.elapsed}s
            </span>
          </div>
        )}
        {status === 'error' && (
          <span style={{ fontSize: 13, color: '#ef4444' }}>⚠ 計測失敗: {result?.error}</span>
        )}
      </div>
    </div>
  )
}

export default function Diagnostics() {
  const [baseDir, setBaseDir]         = useState('')
  const [dbInstalled, setDbInstalled] = useState(false)
  const [dbRunning, setDbRunning]     = useState(false)
  const [localIp, setLocalIp]         = useState('')
  const [globalIp, setGlobalIp]       = useState('')
  const [allPorts, setAllPorts]       = useState(null)

  const [upnpSig, setUpnpSig]       = useState(STATUS.IDLE)
  const [upnpDetail, setUpnpDetail] = useState('')

  const baseDirSig = baseDir ? STATUS.OK : STATUS.ERROR
  const dbSig      = !dbInstalled ? STATUS.ERROR : dbRunning ? STATUS.OK : STATUS.WARN
  const localSig   = localIp && localIp !== '取得失敗' ? STATUS.OK : STATUS.ERROR
  const globalSig  = globalIp && globalIp !== '取得失敗' ? STATUS.OK : STATUS.ERROR

  const checks = [baseDirSig, dbSig, localSig, globalSig, upnpSig].map(s => s === STATUS.OK || s === STATUS.WARN)
  const errorChecks = [baseDirSig, dbSig, localSig, globalSig, upnpSig].filter(s => s === STATUS.ERROR).length
  const allOk = errorChecks === 0 && upnpSig !== STATUS.IDLE && upnpSig !== STATUS.LOADING

  const load = useCallback(async () => {
    const s = await window.api.loadSettings()
    setBaseDir(s.baseDir || '')
    if (s.baseDir) {
      const chk = await window.api.dbCheckInstall({ baseDir: s.baseDir })
      setDbInstalled(chk.installed || chk.hasSettings)
    }
    const st = await window.api.dbStatus()
    setDbRunning(st.running)
    const lip = await window.api.getLocalIp()
    setLocalIp(lip)
    const gip = await window.api.fetchGlobalIp()
    setGlobalIp(gip)
    const ports = await window.api.getAllServerPorts()
    setAllPorts(ports)

    setUpnpSig(STATUS.LOADING)
    setUpnpDetail('')
    const upnp = await window.api.diagUpnpCheck()
    if (upnp.available) {
      setUpnpSig(STATUS.OK)
      setUpnpDetail(`ルーターが UPnP に対応しています（マッピング数: ${upnp.count ?? 0}）`)
    } else {
      setUpnpSig(STATUS.WARN)
      setUpnpDetail(upnp.error || 'ルーターが UPnP に非対応か、無効になっています')
    }
  }, [])

  useEffect(() => {
    load()
    const unsub = window.api.onDbStatusChanged((info) => setDbRunning(info.running))
    return () => unsub()
  }, [load])

  return (
    <div className="diag-root">
      <h2 className="diag-title">🔍 ネットワーク診断</h2>

      {/* チェック項目 */}
      <div className="diag-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div className="diag-card-title" style={{ margin: 0 }}>📋 チェック項目</div>
          <button className="btn btn-restart" style={{ fontSize: 12 }} onClick={load}>🔄 再チェック</button>
        </div>
        <div className="diag-signals">
          <Signal status={baseDirSig} label="ベースディレクトリ">
            <span className="diag-signal-value" style={{ color: baseDirSig === STATUS.ERROR ? '#ef4444' : undefined }}>
              {baseDir || '未設定'}
            </span>
          </Signal>
          <Signal status={dbSig} label="データベース (MariaDB)">
            <span className="diag-signal-value" style={{ color: dbSig === STATUS.ERROR ? '#ef4444' : undefined }}>
              {!dbInstalled ? '未インストール' : dbRunning ? '稼働中' : 'インストール済み・停止中'}
            </span>
          </Signal>
          <Signal status={localSig} label="ローカル IP">
            <span className="diag-signal-value" style={{ color: localSig === STATUS.ERROR ? '#ef4444' : undefined }}>
              {localIp || '取得中...'}
            </span>
            {localIp && localIp !== '取得失敗' && <CopyBtn text={localIp} />}
          </Signal>
          <Signal status={globalSig} label="グローバル IP">
            <span className="diag-signal-value" style={{ color: globalSig === STATUS.ERROR ? '#ef4444' : undefined }}>
              {globalIp || '取得中...'}
            </span>
            {globalIp && globalIp !== '取得失敗' && <CopyBtn text={globalIp} />}
          </Signal>
          <Signal status={upnpSig} label="UPnP">
            <span className="diag-signal-value">
              {upnpSig === STATUS.IDLE ? '' : upnpSig === STATUS.LOADING ? '確認中...' : upnpDetail}
            </span>
          </Signal>
        </div>

        <div className={`diag-summary ${allOk ? 'diag-summary--ok' : 'diag-summary--ng'}`}>
          {allOk
            ? '✅ チェック完了'
            : errorChecks > 0
              ? <span>❌ 不足: <strong style={{ color: '#ef4444' }}>{errorChecks}</strong> 件</span>
              : '⚠ 一部確認が必要です'}
        </div>
      </div>

      {/* 回線速度 */}
      <SpeedSection />

      {/* ポート開放チェック */}
      <PortCheckSection globalIp={globalIp} allPorts={allPorts} />
    </div>
  )
}
