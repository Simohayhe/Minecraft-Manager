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

export default function Diagnostics() {
  const [baseDir, setBaseDir]         = useState('')
  const [dbInstalled, setDbInstalled] = useState(false)
  const [dbRunning, setDbRunning]     = useState(false)
  const [localIp, setLocalIp]         = useState('')
  const [globalIp, setGlobalIp]       = useState('')

  const [upnpSig, setUpnpSig]           = useState(STATUS.IDLE)
  const [upnpDetail, setUpnpDetail]     = useState('')
  const [upnpMappings, setUpnpMappings] = useState([])
  const [deletingPort, setDeletingPort] = useState(null)
  const [showUpnpModal, setShowUpnpModal] = useState(false)

  const baseDirSig = baseDir ? STATUS.OK : STATUS.ERROR
  const dbSig      = !dbInstalled ? STATUS.ERROR : dbRunning ? STATUS.OK : STATUS.WARN
  const localSig   = localIp && localIp !== '取得失敗' ? STATUS.OK : STATUS.ERROR
  const globalSig  = globalIp && globalIp !== '取得失敗' ? STATUS.OK : STATUS.ERROR

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

    setUpnpSig(STATUS.LOADING)
    setUpnpDetail('')
    setUpnpMappings([])
    const upnp = await window.api.diagUpnpCheck()
    if (upnp.available) {
      setUpnpSig(STATUS.OK)
      setUpnpDetail(`ルーターが UPnP に対応しています（マッピング数: ${upnp.count ?? 0}）`)
      const mappings = await window.api.diagUpnpListMapped()
      setUpnpMappings(mappings || [])
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
            {upnpMappings.length > 0 && (
              <button
                onClick={() => setShowUpnpModal(true)}
                style={{ marginLeft: 8, fontSize: 12, padding: '2px 10px', borderRadius: 4,
                  background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)',
                  color: '#15803d', cursor: 'pointer' }}
              >
                一覧を表示
              </button>
            )}
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

      {/* UPnP マッピング一覧モーダル */}
      {showUpnpModal && (
        <div className="modal-overlay" onClick={() => setShowUpnpModal(false)}>
          <div className="modal" style={{ width: 480 }} onClick={e => e.stopPropagation()}>
            <div className="modal-title">UPnP マッピング一覧</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
              {upnpMappings.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '12px 0' }}>マッピングがありません</div>
              ) : upnpMappings.map((m, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 12px', borderRadius: 8,
                  background: 'var(--bg-section)', border: '1px solid var(--border)' }}>
                  <span style={{ fontFamily: 'monospace', fontSize: 13, minWidth: 90, color: 'var(--text)' }}>
                    {m.protocol?.toUpperCase()} :{m.port}
                  </span>
                  <span style={{ flex: 1, fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m.description || '—'}
                  </span>
                  <button
                    className="btn btn-delete"
                    style={{ fontSize: 12, padding: '3px 12px' }}
                    disabled={deletingPort === `${m.port}-${m.protocol}`}
                    onClick={async () => {
                      setDeletingPort(`${m.port}-${m.protocol}`)
                      await window.api.diagUpnpClosePort({ port: m.port, protocol: m.protocol || 'tcp' })
                      const next = upnpMappings.filter((_, j) => j !== i)
                      setUpnpMappings(next)
                      setUpnpDetail(`ルーターが UPnP に対応しています（マッピング数: ${next.length}）`)
                      setDeletingPort(null)
                    }}
                  >
                    {deletingPort === `${m.port}-${m.protocol}` ? '削除中...' : '削除'}
                  </button>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-restart" onClick={() => setShowUpnpModal(false)}>閉じる</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
