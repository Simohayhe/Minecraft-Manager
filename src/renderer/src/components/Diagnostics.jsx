import { useState, useEffect, useCallback } from 'react'

const STATUS = { IDLE: 'idle', OK: 'ok', WARN: 'warn', ERROR: 'error', LOADING: 'loading' }

function Signal({ status, label, children }) {
  const colors = {
    [STATUS.IDLE]:    { bg: 'var(--bg-section)', dot: '#6b7280', border: 'var(--border)' },
    [STATUS.OK]:      { bg: 'rgba(34,197,94,0.08)',  dot: '#22c55e', border: 'rgba(34,197,94,0.3)' },
    [STATUS.WARN]:    { bg: 'rgba(234,179,8,0.08)',  dot: '#eab308', border: 'rgba(234,179,8,0.3)' },
    [STATUS.ERROR]:   { bg: 'rgba(239,68,68,0.08)',  dot: '#ef4444', border: 'rgba(239,68,68,0.3)' },
    [STATUS.LOADING]: { bg: 'rgba(65,90,200,0.06)',  dot: 'var(--text-accent)', border: 'var(--border-strong)' },
  }
  const c = colors[status] || colors[STATUS.IDLE]
  return (
    <div className="diag-signal-row" style={{ background: c.bg, borderColor: c.border }}>
      <span className="diag-signal-dot" style={{ background: c.dot, boxShadow: `0 0 6px ${c.dot}` }}
        data-loading={status === STATUS.LOADING ? 'true' : undefined} />
      <span className="diag-signal-label">{label}</span>
      {children}
    </div>
  )
}

function CopyBtn({ text }) {
  const [copied, setCopied] = useState(false)
  const copy = () => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500) }
  return <button className="diag-copy-btn" onClick={copy}>{copied ? '✓' : 'コピー'}</button>
}

export default function Diagnostics() {
  const [baseDir, setBaseDir]           = useState('')
  const [dbInstalled, setDbInstalled]   = useState(false)
  const [dbRunning, setDbRunning]       = useState(false)
  const [localIp, setLocalIp]           = useState('')
  const [globalIp, setGlobalIp]         = useState('')

  // ポート開放確認
  const [checkPort, setCheckPort]       = useState('25565')
  const [upnpStatus, setUpnpStatus]     = useState(STATUS.IDLE)
  const [upnpMsg, setUpnpMsg]           = useState('')
  const [extStatus, setExtStatus]       = useState(STATUS.IDLE)
  const [extMsg, setExtMsg]             = useState('')

  // チェック判定（速度テスト除外）
  const checks = [
    baseDir !== '',
    dbInstalled && dbRunning,
    localIp !== '' && localIp !== '取得失敗',
    globalIp !== '' && globalIp !== '取得失敗',
  ]
  const passCount = checks.filter(Boolean).length
  const allOk     = checks.every(Boolean)

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
  }, [])

  useEffect(() => {
    load()
    window.api.onDbStatusChanged((info) => setDbRunning(info.running))
  }, [load])

  // UPnP でポート開放
  const runUpnp = async () => {
    setUpnpStatus(STATUS.LOADING); setUpnpMsg('')
    const res = await window.api.diagUpnpOpenPort({ port: parseInt(checkPort), protocol: 'tcp' })
    if (res.success) {
      setUpnpStatus(STATUS.OK)
      setUpnpMsg(`ポート ${checkPort}/TCP を UPnP で開放しました`)
    } else {
      setUpnpStatus(STATUS.WARN)
      setUpnpMsg(`UPnP 失敗: ${res.error || 'ルーターが非対応の可能性があります'}`)
    }
  }

  // 外部ポート確認（ifconfig.co 経由でこのマシンのポートを外部チェック）
  const runExtCheck = async () => {
    setExtStatus(STATUS.LOADING); setExtMsg('')
    const res = await window.api.diagCheckPortExternal({ port: checkPort })
    if (res.success && res.reachable) {
      setExtStatus(STATUS.OK)
      setExtMsg(`✓ 外部 (${res.ip}) からポート ${res.port} に到達できました！`)
    } else if (res.success && !res.reachable) {
      setExtStatus(STATUS.ERROR)
      setExtMsg(`✗ 外部からポート ${checkPort} に到達できません。ポートが閉じているか、サーバーが停止中です。`)
    } else {
      setExtStatus(STATUS.WARN)
      setExtMsg(`確認エラー: ${res.error}`)
    }
  }

  const baseDirSig = baseDir ? STATUS.OK : STATUS.ERROR
  const dbSig      = !dbInstalled ? STATUS.ERROR : dbRunning ? STATUS.OK : STATUS.WARN
  const localSig   = localIp && localIp !== '取得失敗' ? STATUS.OK : STATUS.ERROR
  const globalSig  = globalIp && globalIp !== '取得失敗' ? STATUS.OK : STATUS.ERROR

  return (
    <div className="diag-root">
      <h2 className="diag-title">🔍 ネットワーク診断</h2>

      {/* チェック項目 */}
      <div className="diag-card">
        <div className="diag-card-title">📋 チェック項目</div>
        <div className="diag-signals">
          <Signal status={baseDirSig} label="ベースディレクトリ">
            <span className="diag-signal-value">{baseDir || '未設定'}</span>
          </Signal>
          <Signal status={dbSig} label="データベース (MariaDB)">
            <span className="diag-signal-value">
              {!dbInstalled ? '未インストール' : dbRunning ? '稼働中' : 'インストール済み・停止中'}
            </span>
          </Signal>
          <Signal status={localSig} label="ローカル IP">
            <span className="diag-signal-value">{localIp || '取得中...'}</span>
            {localIp && localIp !== '取得失敗' && <CopyBtn text={localIp} />}
          </Signal>
          <Signal status={globalSig} label="グローバル IP">
            <span className="diag-signal-value">{globalIp || '取得中...'}</span>
            {globalIp && globalIp !== '取得失敗' && <CopyBtn text={globalIp} />}
          </Signal>
        </div>

        <div className={`diag-summary ${allOk ? 'diag-summary--ok' : 'diag-summary--ng'}`}>
          {allOk
            ? '✅ チェック完了'
            : <span>❌ 不足: <strong style={{ color: '#ef4444' }}>{checks.length - passCount}</strong> 項目</span>}
        </div>
      </div>

      {/* ポート開放確認 */}
      <div className="diag-card">
        <div className="diag-card-title">🔓 ポート開放確認</div>
        <p className="diag-muted" style={{ margin: '0 0 8px' }}>
          ポートを指定して UPnP で開放し、外部から到達できるか確認します。<br />
          ポートの一覧管理は <strong>設定</strong> タブの「ポート開放管理」からできます。
        </p>

        <div className="diag-port-row">
          <label className="diag-label">対象ポート</label>
          <input className="diag-input" type="number" value={checkPort}
            onChange={e => setCheckPort(e.target.value)} min={1} max={65535} />
        </div>

        <div className="diag-port-actions">
          <button className="diag-btn diag-btn--primary" onClick={runUpnp}
            disabled={upnpStatus === STATUS.LOADING}>
            📡 UPnP で開放
          </button>
          <button className="diag-btn diag-btn--secondary" onClick={runExtCheck}
            disabled={extStatus === STATUS.LOADING}>
            🌐 外部から確認
          </button>
        </div>

        {upnpStatus === STATUS.LOADING && <div className="diag-msg diag-msg--info">UPnP リクエスト送信中...</div>}
        {upnpMsg && (
          <div className={`diag-msg ${upnpStatus === STATUS.OK ? 'diag-msg--ok' : upnpStatus === STATUS.ERROR ? 'diag-msg--error' : 'diag-msg--warn'}`}>
            {upnpMsg}
          </div>
        )}
        {extStatus === STATUS.LOADING && <div className="diag-msg diag-msg--info">外部から確認中（最大 20 秒）...</div>}
        {extMsg && (
          <div className={`diag-msg ${extStatus === STATUS.OK ? 'diag-msg--ok' : extStatus === STATUS.ERROR ? 'diag-msg--error' : 'diag-msg--warn'}`}>
            {extMsg}
          </div>
        )}
      </div>
    </div>
  )
}
