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
  const [baseDir, setBaseDir]         = useState('')
  const [dbInstalled, setDbInstalled] = useState(false)
  const [dbRunning, setDbRunning]     = useState(false)
  const [localIp, setLocalIp]         = useState('')
  const [globalIp, setGlobalIp]       = useState('')

  // UPnP 可用性
  const [upnpSig, setUpnpSig]     = useState(STATUS.IDLE)
  const [upnpDetail, setUpnpDetail] = useState('')

  // チェック判定
  const checks = [
    baseDir !== '',
    dbInstalled && dbRunning,
    localIp !== '' && localIp !== '取得失敗',
    globalIp !== '' && globalIp !== '取得失敗',
    upnpSig === STATUS.OK,
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

    // UPnP チェック
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

  const baseDirSig = baseDir ? STATUS.OK : STATUS.ERROR
  const dbSig      = !dbInstalled ? STATUS.ERROR : dbRunning ? STATUS.OK : STATUS.WARN
  const localSig   = localIp && localIp !== '取得失敗' ? STATUS.OK : STATUS.ERROR
  const globalSig  = globalIp && globalIp !== '取得失敗' ? STATUS.OK : STATUS.ERROR

  return (
    <div className="diag-root">
      <h2 className="diag-title">🔍 ネットワーク診断</h2>

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
          <Signal status={upnpSig} label="UPnP">
            <span className="diag-signal-value">
              {upnpSig === STATUS.IDLE ? '' : upnpSig === STATUS.LOADING ? '確認中...' : upnpDetail}
            </span>
          </Signal>
        </div>

        <div className={`diag-summary ${allOk ? 'diag-summary--ok' : 'diag-summary--ng'}`}>
          {allOk
            ? '✅ チェック完了'
            : <span>❌ 不足: <strong style={{ color: '#ef4444' }}>{checks.length - passCount}</strong> 項目</span>}
        </div>
      </div>
    </div>
  )
}
