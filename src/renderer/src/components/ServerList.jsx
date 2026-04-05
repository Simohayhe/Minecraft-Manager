import { useState, useEffect, useRef, useMemo, useCallback } from 'react'

// クラスター基本設定で共通化できる項目
const CLUSTER_KEYS = [
  'difficulty',
  'gamemode',
  'allow-flight',
  'hardcore',
  'pvp',
  'spawn-monsters',
  'spawn-animals',
  'spawn-npcs',
  'max-players',
  'online-mode',
  'view-distance',
  'simulation-distance',
  'network-compression-threshold',
  'spawn-protection',
]

// サーバー個別設定のメイン表示項目
const COMMON_KEYS = [
  'level-name',
  'gamemode',
  'difficulty',
  'level-type',
  'enable-rcon',
  'rcon.port',
  'rcon.password',
]

const BOOLEAN_KEYS = new Set([
  'accepts-transfers','allow-flight','broadcast-console-to-ops','broadcast-rcon-to-ops',
  'enable-code-of-conduct','enable-jmx-monitoring','enable-query','enable-rcon','enable-status',
  'enforce-secure-profile','enforce-whitelist','force-gamemode','generate-structures','hardcore',
  'hide-online-players','log-ips','management-server-enabled','management-server-tls-enabled',
  'online-mode','prevent-proxy-connections','pvp','require-resource-pack','sync-chunk-writes',
  'use-native-transport','white-list','spawn-animals','spawn-monsters','spawn-npcs',
])

const SELECT_OPTIONS = {
  'difficulty': ['peaceful','easy','normal','hard'],
  'gamemode': ['survival','creative','adventure','spectator'],
  'level-type': ['minecraft:normal','minecraft:flat','minecraft:large_biomes','minecraft:amplified','minecraft:single_biome_surface'],
  'region-file-compression': ['deflate','lz4','none'],
}

const PROPERTY_LABELS = {
  'accepts-transfers': 'プレイヤー転送を受け入れる',
  'allow-flight': 'フライト許可',
  'broadcast-console-to-ops': 'コンソールをOPに配信',
  'broadcast-rcon-to-ops': 'RCONをOPに配信',
  'bug-report-link': 'バグレポートリンク',
  'difficulty': '難易度',
  'enable-code-of-conduct': '行動規範を有効化',
  'enable-jmx-monitoring': 'JMX監視を有効化',
  'enable-query': 'クエリを有効化',
  'enable-rcon': 'RCONを有効化',
  'enable-status': 'ステータスを有効化',
  'enforce-secure-profile': 'セキュアプロファイルを強制',
  'enforce-whitelist': 'ホワイトリストを強制',
  'entity-broadcast-range-percentage': 'エンティティ配信範囲(%)',
  'force-gamemode': 'ゲームモードを強制',
  'function-permission-level': 'ファンクション権限レベル',
  'gamemode': 'ゲームモード',
  'generate-structures': '構造物生成',
  'generator-settings': 'ジェネレーター設定',
  'hardcore': 'ハードコアモード',
  'hide-online-players': 'オンラインプレイヤーを非表示',
  'initial-disabled-packs': '初期無効パック',
  'initial-enabled-packs': '初期有効パック',
  'level-name': 'ワールド名',
  'level-seed': 'シード値',
  'level-type': 'ワールドタイプ',
  'log-ips': 'IPをログに記録',
  'management-server-allowed-origins': '管理サーバー許可オリジン',
  'management-server-enabled': '管理サーバーを有効化',
  'management-server-host': '管理サーバーホスト',
  'management-server-port': '管理サーバーポート',
  'management-server-secret': '管理サーバーシークレット',
  'management-server-tls-enabled': '管理サーバーTLSを有効化',
  'management-server-tls-keystore': '管理サーバーTLSキーストア',
  'management-server-tls-keystore-password': '管理サーバーTLSキーストアパスワード',
  'max-chained-neighbor-updates': '最大連鎖近隣更新数',
  'max-players': '最大プレイヤー数',
  'max-tick-time': '最大Tick時間(ms)',
  'max-world-size': '最大ワールドサイズ',
  'motd': 'サーバーメッセージ',
  'network-compression-threshold': 'ネットワーク圧縮閾値',
  'online-mode': 'オンラインモード',
  'op-permission-level': 'OP権限レベル',
  'pause-when-empty-seconds': '空時停止秒数',
  'player-idle-timeout': 'アイドルタイムアウト(分)',
  'prevent-proxy-connections': 'プロキシ接続を拒否',
  'pvp': 'PvP',
  'query.port': 'クエリポート',
  'rate-limit': 'レート制限',
  'rcon.password': 'RCONパスワード',
  'rcon.port': 'RCONポート',
  'region-file-compression': 'リージョンファイル圧縮',
  'require-resource-pack': 'リソースパックを必須化',
  'resource-pack': 'リソースパックURL',
  'resource-pack-id': 'リソースパックID',
  'resource-pack-prompt': 'リソースパックメッセージ',
  'resource-pack-sha1': 'リソースパックSHA1',
  'server-ip': 'サーバーIP',
  'server-port': 'サーバーポート',
  'simulation-distance': 'シミュレーション距離',
  'spawn-animals': '動物スポーン',
  'spawn-monsters': 'モンスタースポーン',
  'spawn-npcs': 'NPCスポーン',
  'spawn-protection': 'スポーン保護範囲',
  'status-heartbeat-interval': 'ステータスハートビート間隔',
  'sync-chunk-writes': 'チャンク書き込み同期',
  'text-filtering-config': 'テキストフィルター設定',
  'text-filtering-version': 'テキストフィルターバージョン',
  'use-native-transport': 'ネイティブトランスポート使用',
  'view-distance': '表示距離',
  'white-list': 'ホワイトリスト',
}

const DEFAULT_PROPERTIES = {
  'accepts-transfers': 'true',
  'allow-flight': 'true',
  'broadcast-console-to-ops': 'true',
  'broadcast-rcon-to-ops': 'true',
  'bug-report-link': '',
  'difficulty': 'normal',
  'enable-code-of-conduct': 'false',
  'enable-jmx-monitoring': 'false',
  'enable-query': 'false',
  'enable-rcon': 'false',
  'enable-status': 'true',
  'enforce-secure-profile': 'false',
  'enforce-whitelist': 'false',
  'entity-broadcast-range-percentage': '100',
  'force-gamemode': 'false',
  'function-permission-level': '2',
  'gamemode': 'survival',
  'generate-structures': 'true',
  'generator-settings': '{}',
  'hardcore': 'false',
  'hide-online-players': 'false',
  'initial-disabled-packs': '',
  'initial-enabled-packs': 'vanilla',
  'level-name': 'world',
  'level-seed': '',
  'level-type': 'minecraft:normal',
  'log-ips': 'true',
  'management-server-allowed-origins': '',
  'management-server-enabled': 'false',
  'management-server-host': '',
  'management-server-port': '0',
  'management-server-secret': '',
  'management-server-tls-enabled': 'true',
  'management-server-tls-keystore': '',
  'management-server-tls-keystore-password': '',
  'max-chained-neighbor-updates': '1000000',
  'max-players': '20',
  'max-tick-time': '60000',
  'max-world-size': '29999984',
  'motd': 'A Minecraft Server',
  'network-compression-threshold': '512',
  'online-mode': 'true',
  'op-permission-level': '4',
  'pause-when-empty-seconds': '60',
  'player-idle-timeout': '0',
  'prevent-proxy-connections': 'false',
  'pvp': 'true',
  'query.port': '25565',
  'rate-limit': '0',
  'rcon.password': '',
  'rcon.port': '25576',
  'region-file-compression': 'deflate',
  'require-resource-pack': 'false',
  'resource-pack': '',
  'resource-pack-id': '',
  'resource-pack-prompt': '',
  'resource-pack-sha1': '',
  'server-ip': '',
  'server-port': '25565',
  'simulation-distance': '10',
  'spawn-animals': 'true',
  'spawn-monsters': 'true',
  'spawn-npcs': 'true',
  'spawn-protection': '0',
  'status-heartbeat-interval': '0',
  'sync-chunk-writes': 'true',
  'text-filtering-config': '',
  'text-filtering-version': '0',
  'use-native-transport': 'true',
  'view-distance': '10',
  'white-list': 'false',
}

// クラスター基本設定のデフォルト（共通項目のみ）
const DEFAULT_CLUSTER_PROPERTIES = Object.fromEntries(
  CLUSTER_KEYS.map(k => [k, DEFAULT_PROPERTIES[k]])
)

// 常時ONにするMod（FabricAPI）
const isLockedMod = (filename) => {
  const lower = filename.toLowerCase()
  return lower.includes('fabric-api')
}

function PropertyField({ propKey, value, onChange, disabled = false }) {
  if (BOOLEAN_KEYS.has(propKey)) {
    const isTrue = value === 'true'
    return (
      <button
        onClick={() => !disabled && onChange(propKey, isTrue ? 'false' : 'true')}
        style={{
          padding: '4px 16px', borderRadius: 6, border: 'none',
          cursor: disabled ? 'not-allowed' : 'pointer',
          fontWeight: 700, fontSize: 12,
          background: isTrue ? '#22c55e' : '#ef4444', color: '#fff', minWidth: 60,
          opacity: disabled ? 0.5 : 1,
        }}
      >
        {isTrue ? 'ON' : 'OFF'}
      </button>
    )
  }
  if (SELECT_OPTIONS[propKey]) {
    return (
      <select className="modal-input property-value" value={value} onChange={e => onChange(propKey, e.target.value)} disabled={disabled} style={{ opacity: disabled ? 0.5 : 1 }}>
        {SELECT_OPTIONS[propKey].map(opt => <option key={opt} value={opt}>{opt}</option>)}
      </select>
    )
  }
  return (
    <input className="modal-input property-value" value={value} onChange={e => onChange(propKey, e.target.value)} disabled={disabled} style={{ opacity: disabled ? 0.5 : 1 }} />
  )
}

function PropertiesEditor({ properties, onChange, clusterOnly = false, lockedKeys = null }) {
  const [showAdvanced, setShowAdvanced] = useState(false)

  if (clusterOnly) {
    // クラスター基本設定：CLUSTER_KEYSのみ表示
    const entries = CLUSTER_KEYS
      .filter(k => k in properties)
      .map(k => [k, properties[k]])
    return (
      <div className="properties-grid">
        {entries.map(([key, value]) => (
          <div key={key} className="property-row">
            <div className="property-key" title={key}>{PROPERTY_LABELS[key] || key}</div>
            <PropertyField propKey={key} value={value} onChange={onChange} />
          </div>
        ))}
      </div>
    )
  }

  // 個別設定：メイン表示 + 詳細
  const commonEntries = COMMON_KEYS
    .filter(k => k in properties)
    .map(k => [k, properties[k]])

  const advancedEntries = Object.entries(properties)
    .filter(([k]) => !COMMON_KEYS.includes(k))
    .sort(([a], [b]) => a.localeCompare(b))

  return (
    <div>
      <div className="properties-grid">
        {commonEntries.map(([key, value]) => (
          <div key={key} className="property-row">
            <div className="property-key" title={key}>{PROPERTY_LABELS[key] || key}</div>
            <PropertyField propKey={key} value={value} onChange={onChange} disabled={lockedKeys?.has(key) ?? false} />
          </div>
        ))}
      </div>
      <div style={{ marginTop: 12 }}>
        <button className="btn btn-restart" style={{ fontSize: 12, padding: '4px 14px' }} onClick={() => setShowAdvanced(p => !p)}>
          {showAdvanced ? '▲ 詳細設定を隠す' : '▼ 詳細設定を表示'}
        </button>
      </div>
      {showAdvanced && (
        <div className="properties-grid" style={{ marginTop: 12 }}>
          {advancedEntries.map(([key, value]) => (
            <div key={key} className="property-row">
              <div className="property-key" title={key}>{PROPERTY_LABELS[key] || key}</div>
              <PropertyField propKey={key} value={value} onChange={onChange} disabled={lockedKeys?.has(key) ?? false} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}


function ConfirmModal({ message, onConfirm, onClose, confirmLabel = '削除', confirmClass = 'btn-stop', checkboxLabel, checkboxChecked, onCheckboxChange }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-title">確認</div>
        <p style={{ color: 'var(--text-2)', fontSize: 14, whiteSpace: 'pre-wrap' }}>{message}</p>
        {checkboxLabel && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#ef4444', marginBottom: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={!!checkboxChecked} onChange={e => onCheckboxChange && onCheckboxChange(e.target.checked)} />
            {checkboxLabel}
          </label>
        )}
        <div className="modal-actions">
          <button className={`btn ${confirmClass}`} onClick={onConfirm}>{confirmLabel}</button>
          <button className="btn btn-restart" onClick={onClose}>キャンセル</button>
        </div>
      </div>
    </div>
  )
}

function ClusterModTab({ cluster, onUpdate }) {
  const [librarySources, setLibrarySources] = useState([])
  const [enabled, setEnabled] = useState(cluster.enabledMods || [])
  const [applying, setApplying] = useState(false)
  const [applied, setApplied] = useState(false)

  useEffect(() => {
    window.api.getLibraryStructure().then(r => {
      const sources = r.mods || []
      setLibrarySources(sources)
      const locked = sources.flatMap(s => s.files).filter(isLockedMod)
      if (locked.length > 0) setEnabled(prev => [...new Set([...prev, ...locked])])
    })
  }, [])

  const allFilenames = librarySources.flatMap(s => s.files)
  const checkableFiles = allFilenames.filter(f => !isLockedMod(f))
  const allChecked = checkableFiles.length > 0 && checkableFiles.every(f => enabled.includes(f))
  const someChecked = checkableFiles.some(f => enabled.includes(f))

  const toggle = (filename, e) => {
    if (isLockedMod(filename) && !e.shiftKey) return
    setEnabled(prev => prev.includes(filename) ? prev.filter(x => x !== filename) : [...prev, filename])
  }

  const toggleMaster = () => {
    if (allChecked) {
      setEnabled(prev => prev.filter(f => isLockedMod(f)))
    } else {
      setEnabled(prev => [...new Set([...prev, ...checkableFiles])])
    }
  }

  const handleApply = async () => {
    setApplying(true)
    const fabricServers = cluster.servers.filter(s => (s.type || 'fabric') === 'fabric' && s.useClusterMods !== false)
    for (const server of fabricServers) {
      if (!server.serverDir) continue
      const source = librarySources.find(m => m.loader === 'fabric' && m.version === server.mcVersion)
      if (!source) continue
      const filtered = enabled.filter(f => source.files.includes(f))
      await window.api.applyServerMods({ serverDir: server.serverDir, enabledMods: filtered, libraryModsDir: source.dir })
    }
    onUpdate({ ...cluster, enabledMods: enabled })
    setApplying(false); setApplied(true); setTimeout(() => setApplied(false), 2000)
  }

  return (
    <div className="settings-section">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <div className="settings-label">クラスター共通 Mod</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {applied && <span style={{ color: '#4ade80', fontSize: 12 }}>適用完了</span>}
          <button className="btn btn-start" onClick={handleApply} disabled={applying}>
            {applying ? '適用中...' : '全Fabricサーバーに適用'}
          </button>
        </div>
      </div>
      {allFilenames.length === 0 ? (
        <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>ライブラリにModがありません。</div>
      ) : (
        <>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '8px 12px', marginBottom: 8, cursor: 'pointer',
            borderBottom: '1px solid var(--border)'
          }} onClick={toggleMaster}>
            <div style={{
              width: 16, height: 16, borderRadius: 3, border: '2px solid',
              borderColor: allChecked ? '#4ade80' : someChecked ? '#f59e0b' : 'var(--border-strong)',
              background: allChecked ? '#4ade80' : 'transparent',
              flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              {someChecked && !allChecked && <div style={{ width: 8, height: 2, background: '#f59e0b', borderRadius: 1 }} />}
            </div>
            <span style={{ color: 'var(--text-2)', fontSize: 12, fontWeight: 700 }}>すべて選択</span>
          </div>
          {librarySources.map(source => source.files.length === 0 ? null : (
            <div key={source.id} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                <span style={{ background: 'var(--bg-tag-blue)', color: 'var(--text-accent-2)', fontSize: 11, padding: '2px 6px', borderRadius: 4 }}>{source.loader}</span>
                <span style={{ background: 'var(--bg-tag-blue)', color: '#4ade80', fontSize: 11, padding: '2px 6px', borderRadius: 4 }}>{source.version}</span>
              </div>
              {source.files.map(filename => {
                const locked = isLockedMod(filename)
                return (
                  <div key={filename} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '8px 12px', background: 'var(--bg-card)', borderRadius: 6,
                    border: '1px solid var(--border)', cursor: locked ? 'default' : 'pointer', marginBottom: 3
                  }} onClick={(e) => toggle(filename, e)}
                    title={locked ? 'Shift+クリックで変更できます' : ''}>
                    <div style={{
                      width: 16, height: 16, borderRadius: 3, border: '2px solid',
                      borderColor: enabled.includes(filename) ? '#4ade80' : 'var(--border-strong)',
                      background: enabled.includes(filename) ? '#4ade80' : 'transparent', flexShrink: 0
                    }} />
                    <span style={{ color: 'var(--text)', fontSize: 13, flex: 1 }}>{filename}</span>
                    {locked && <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>🔒</span>}
                  </div>
                )
              })}
            </div>
          ))}
        </>
      )}
    </div>
  )
}

function ModPluginTab({ server, cluster, onUpdateServer }) {
  const isFabric = (server.type || 'fabric') === 'fabric'
  const [libraryItems, setLibraryItems] = useState([])
  const [librarySourceDir, setLibrarySourceDir] = useState('')
  const [paperSources, setPaperSources] = useState([])
  const [useClusterMods, setUseClusterMods] = useState(isFabric && cluster ? (server.useClusterMods !== false) : false)
  const [enabled, setEnabled] = useState(
    useClusterMods ? (cluster?.enabledMods || []) : (isFabric ? (server.enabledMods || []) : (server.enabledPlugins || []))
  )
  const [applying, setApplying] = useState(false)
  const [applied, setApplied] = useState(false)
  const [configModal, setConfigModal] = useState(null) // { filename, filePath }
  const [configPicker, setConfigPicker] = useState(null) // { modFilename, configs: [{filename, path}] }

  const openConfig = async (e, filename) => {
    e.stopPropagation()
    if (!server.serverDir) return
    const configs = await window.api.listModConfigs({ serverDir: server.serverDir, modFilename: filename })
    if (configs.length === 0) return
    if (configs.length === 1) setConfigModal({ filename: configs[0].filename, filePath: configs[0].path })
    else setConfigPicker({ modFilename: filename, configs })
  }

  useEffect(() => {
    window.api.getLibraryStructure().then(result => {
      if (isFabric) {
        const mcVersion = server.mcVersion || ''
        const entry = result.mods.find(m => m.loader === 'fabric' && m.version === mcVersion)
        const files = entry ? entry.files : []
        setLibraryItems(files)
        setLibrarySourceDir(entry ? entry.dir : '')
        if (!useClusterMods) {
          const locked = files.filter(isLockedMod)
          if (locked.length > 0) setEnabled(prev => [...new Set([...prev, ...locked])])
        }
      } else {
        const sources = result.paperSources || []
        setPaperSources(sources)
        setLibraryItems(sources.flatMap(s => s.files))
      }
    })
  }, [isFabric, server.mcVersion])

  useEffect(() => {
    if (useClusterMods) {
      setEnabled(cluster?.enabledMods || [])
    } else {
      setEnabled(isFabric ? (server.enabledMods || []) : (server.enabledPlugins || []))
    }
  }, [useClusterMods])

  const checkableItems = isFabric ? libraryItems.filter(f => !isLockedMod(f)) : libraryItems
  const allChecked = checkableItems.length > 0 && checkableItems.every(f => enabled.includes(f))
  const someChecked = checkableItems.some(f => enabled.includes(f))

  const toggle = (filename, e) => {
    if (useClusterMods) return
    if (isFabric && isLockedMod(filename) && !(e && e.shiftKey)) return
    setEnabled(prev => prev.includes(filename) ? prev.filter(f => f !== filename) : [...prev, filename])
  }

  const toggleMaster = () => {
    if (useClusterMods) return
    if (allChecked) {
      setEnabled(prev => isFabric ? prev.filter(f => isLockedMod(f)) : [])
    } else {
      setEnabled(prev => [...new Set([...prev, ...checkableItems])])
    }
  }

  const handleApply = async () => {
    if (!server.serverDir) return
    setApplying(true)
    if (isFabric) {
      if (!librarySourceDir) { setApplying(false); return }
      await window.api.applyServerMods({ serverDir: server.serverDir, enabledMods: enabled, libraryModsDir: librarySourceDir })
      onUpdateServer({ ...server, enabledMods: enabled })
    } else {
      await window.api.applyServerPlugins({ serverDir: server.serverDir, enabledPlugins: enabled, librarySources: paperSources })
      onUpdateServer({ ...server, enabledPlugins: enabled })
    }
    setApplying(false)
    setApplied(true)
    setTimeout(() => setApplied(false), 2000)
  }

  const handleToggleClusterMods = () => {
    const next = !useClusterMods
    setUseClusterMods(next)
    onUpdateServer({ ...server, useClusterMods: next })
  }

  return (
    <div className="settings-section">
      {isFabric && cluster && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, padding: '10px 14px', background: 'var(--bg-card)', borderRadius: 8, border: '1px solid var(--border)' }}>
          <div className="settings-label" style={{ marginBottom: 0 }}>Mod設定</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {useClusterMods && <span style={{ color: 'var(--text-accent-2)', fontSize: 12 }}>クラスター設定を使用中</span>}
            <button className={`btn ${useClusterMods ? 'btn-restart' : 'btn-stop'}`} onClick={handleToggleClusterMods}>
              {useClusterMods ? '個別設定を有効化' : 'クラスター設定を使用中'}
            </button>
          </div>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div className="settings-label">{isFabric ? 'Mod' : 'Plugin'} 選択</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {applied && <span style={{ color: '#4ade80', fontSize: 12 }}>適用完了</span>}
          {!useClusterMods && (
            <button className="btn btn-start" onClick={handleApply} disabled={applying}>
              {applying ? '適用中...' : '適用'}
            </button>
          )}
        </div>
      </div>
      {libraryItems.length === 0 ? (
        <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>
          ライブラリに{isFabric ? 'Mod' : 'Plugin'}がありません。「Mod管理」ページから追加してください。
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, opacity: useClusterMods ? 0.5 : 1 }}>
          {!useClusterMods && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '8px 12px', cursor: 'pointer',
              borderBottom: '1px solid var(--border)', marginBottom: 4
            }} onClick={toggleMaster}>
              <div style={{
                width: 16, height: 16, borderRadius: 3, border: '2px solid',
                borderColor: allChecked ? '#4ade80' : someChecked ? '#f59e0b' : 'var(--border-strong)',
                background: allChecked ? '#4ade80' : 'transparent',
                flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                {someChecked && !allChecked && <div style={{ width: 8, height: 2, background: '#f59e0b', borderRadius: 1 }} />}
              </div>
              <span style={{ color: 'var(--text-2)', fontSize: 12, fontWeight: 700 }}>すべて選択</span>
            </div>
          )}
          {libraryItems.map(filename => {
            const locked = isFabric && isLockedMod(filename)
            return (
              <div key={filename} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '8px 12px', background: 'var(--bg-card)', borderRadius: 6, border: '1px solid var(--border)',
                cursor: (useClusterMods || locked) ? 'default' : 'pointer'
              }} onClick={(e) => toggle(filename, e)}
                title={locked ? 'Shift+クリックで変更できます' : ''}>
                <div style={{
                  width: 16, height: 16, borderRadius: 3, border: '2px solid',
                  borderColor: enabled.includes(filename) ? '#4ade80' : 'var(--border-strong)',
                  background: enabled.includes(filename) ? '#4ade80' : 'transparent',
                  flexShrink: 0
                }} />
                <span style={{ color: 'var(--text)', fontSize: 13, flex: 1 }}>{filename}</span>
                {locked && <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>🔒</span>}
                {server.serverDir && (
                  <button
                    onClick={(e) => openConfig(e, filename)}
                    title="Config編集"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', fontSize: 14, padding: '0 2px', lineHeight: 1 }}
                  >⚙</button>
                )}
              </div>
            )
          })}
        </div>
      )}
      {configModal && (
        <ConfigEditorModal
          filename={configModal.filename}
          filePath={configModal.filePath}
          onClose={() => setConfigModal(null)}
        />
      )}
      {configPicker && (
        <div className="modal-overlay" onClick={() => setConfigPicker(null)}>
          <div className="modal" style={{ width: 420 }} onClick={e => e.stopPropagation()}>
            <div className="modal-title">Config ファイルを選択</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>{configPicker.modFilename}</div>
            {configPicker.configs.map(c => (
              <div key={c.path} style={{
                padding: '8px 12px', borderRadius: 6, background: 'var(--bg-card)', border: '1px solid var(--border)',
                cursor: 'pointer', marginBottom: 6, fontSize: 13, color: 'var(--text)'
              }} onClick={() => { setConfigModal({ filename: c.filename, filePath: c.path }); setConfigPicker(null) }}>
                {c.filename}
              </div>
            ))}
            <button className="btn btn-restart" style={{ marginTop: 8, width: '100%' }} onClick={() => setConfigPicker(null)}>キャンセル</button>
          </div>
        </div>
      )}
    </div>
  )
}

function AddServerModal({ onAdd, onClose, baseDir, cluster }) {
  const [name, setName] = useState('')
  const [port, setPort] = useState('25565')
  const [serverType, setServerType] = useState('fabric')
  const [fabricVersions, setFabricVersions] = useState([])
  const [paperVersions, setPaperVersions] = useState([])
  const [mcVersion, setMcVersion] = useState('')
  const [voidWorld, setVoidWorld] = useState(true)
  const [installing, setInstalling] = useState(false)
  const [installLogs, setInstallLogs] = useState([])
  const [error, setError] = useState('')
  const logRef = useRef(null)

  useEffect(() => {
    window.api.fetchFabricVersions().then(v => { setFabricVersions(v); if (serverType === 'fabric' && v.length > 0) setMcVersion(v[0]) })
    window.api.fetchPaperVersions().then(v => { setPaperVersions(v); if (serverType === 'paper' && v.length > 0) setMcVersion(v[0]) })
    window.api.onInstallLog(msg => setInstallLogs(prev => [...prev, msg]))
    return () => window.api.removeAllListeners('install-log')
  }, [])

  useEffect(() => {
    const versions = serverType === 'fabric' ? fabricVersions : paperVersions
    if (versions.length > 0) setMcVersion(versions[0])
  }, [serverType, fabricVersions, paperVersions])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [installLogs])

  const handleInstall = async () => {
    setError('')
    if (!baseDir) { setError('設定でサーバーベースフォルダを指定してください'); return }
    if (!name.trim()) { setError('サーバー名を入力してください'); return }
    if (!mcVersion) { setError('バージョンを選択してください'); return }
    setInstalling(true)
    const serverPort = parseInt(port) || 25565
    const installOpts = { serverName: name.trim(), mcVersion, baseDir, clusterName: cluster?.name || 'standalone', serverPort, voidWorld: serverType === 'paper' ? voidWorld : false }
    const result = serverType === 'paper'
      ? await window.api.installPaper(installOpts)
      : await window.api.installFabric(installOpts)
    if (!result.success) {
      setError('インストールに失敗しました。ログを確認してください')
      setInstalling(false)
      return
    }

    if (result.success) {
      const newServer = {
        id: `server-${Date.now()}`, name, port: serverPort, serverDir: result.serverDir,
        type: serverType, mcVersion,
        enabledMods: [], enabledPlugins: [], individualProperties: null,
        jvmMemory: { value: 2, unit: 'G' }
      }
      if (cluster?.velocity?.forwardingSecret) {
        if (serverType === 'fabric') {
          await window.api.setupFabricProxy({ serverDir: result.serverDir, mcVersion, forwardingSecret: cluster.velocity.forwardingSecret })
        } else {
          await window.api.setupPaperProxy({ serverDir: result.serverDir, forwardingSecret: cluster.velocity.forwardingSecret })
        }
      }
      if (cluster?.velocity && baseDir) {
        const velocityDir = `${baseDir}\\${cluster.name}\\velocity`
        await window.api.writeVelocityToml({
          velocityDir, servers: [...cluster.servers, newServer],
          port: cluster.velocity.port, motd: cluster.velocity.motd,
          maxPlayers: cluster.velocity.maxPlayers, forwardingMode: cluster.velocity.forwardingMode,
          forwardingSecret: cluster.velocity.forwardingSecret,
          tryServers: cluster.velocity.tryServers || [],
        })
      }
      // スタンドアロンサーバーは online-mode=true を保証
      if (!cluster && result.serverDir) {
        const props = await window.api.readServerProperties({ serverDir: result.serverDir })
        if (props && props['online-mode'] === 'false') {
          await window.api.writeServerProperties({ serverDir: result.serverDir, properties: { ...props, 'online-mode': 'true' } })
        }
      }
      onAdd(newServer)
      onClose()
    }
    setInstalling(false)
  }

  const versions = serverType === 'fabric' ? fabricVersions : paperVersions

  return (
    <div className="modal-overlay" onClick={!installing ? onClose : undefined}>
      <div className="modal" style={{ width: 420 }} onClick={e => e.stopPropagation()}>
        <div className="modal-title">サーバーを追加</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <button
            className={`btn ${serverType === 'fabric' ? 'btn-start' : 'btn-restart'}`}
            style={{ flex: 1, fontSize: 12 }}
            onClick={() => setServerType('fabric')}
            disabled={installing}
          >Fabric（Mod）</button>
          <button
            className={`btn ${serverType === 'paper' ? 'btn-start' : 'btn-restart'}`}
            style={{ flex: 1, fontSize: 12 }}
            onClick={() => setServerType('paper')}
            disabled={installing}
          >Paper（Plugin・Void）</button>
        </div>
        <input className="modal-input" placeholder="サーバー名" value={name} onChange={e => setName(e.target.value)} disabled={installing} />
        <input className="modal-input" placeholder="ポート番号" value={port} onChange={e => setPort(e.target.value)} type="number" disabled={installing} />
        <select className="modal-input" value={mcVersion} onChange={e => setMcVersion(e.target.value)} disabled={installing}>
          {versions.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        {serverType === 'paper' && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)', padding: '4px 2px', cursor: 'pointer' }}>
            <input type="checkbox" checked={voidWorld} onChange={e => setVoidWorld(e.target.checked)} disabled={installing} />
            Voidワールド（Peaceful / Adventureモード）で初期設定
          </label>
        )}
        {!baseDir && (
          <div style={{ fontSize: 12, color: '#f59e0b', padding: '4px 2px' }}>
            ⚠ 設定からサーバーベースフォルダを先に指定してください
          </div>
        )}
        {error && (
          <div style={{ fontSize: 12, color: '#ef4444', padding: '4px 2px' }}>⚠ {error}</div>
        )}
        {installLogs.length > 0 && (
          <div className="log-box" ref={logRef} style={{ height: 100 }}>
            {installLogs.map((l, i) => <div key={i}>{l}</div>)}
          </div>
        )}
        <div className="modal-actions">
          {!installing && <button className="btn btn-start" onClick={handleInstall}>インストール＆追加</button>}
          {installing && <span style={{ color: '#f59e0b', fontSize: 13 }}>インストール中...</span>}
          {!installing && <button className="btn btn-stop" onClick={onClose}>キャンセル</button>}
        </div>
      </div>
    </div>
  )
}

function AddClusterModal({ onAdd, onClose, baseDir }) {
  const [name, setName] = useState('')
  const [port, setPort] = useState('25577')
  const [secret, setSecret] = useState(() => generateSecret())
  const [installing, setInstalling] = useState(false)
  const [logs, setLogs] = useState([])
  const logRef = useRef(null)

  useEffect(() => {
    window.api.onVelocityLog(msg => setLogs(prev => [...prev, msg]))
    return () => window.api.removeAllListeners('velocity-log')
  }, [])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [logs])

  const handleSubmit = async () => {
    if (!name) return
    const velocityConfig = {
      port: parseInt(port) || 25577,
      forwardingMode: 'modern',
      forwardingSecret: secret,
      motd: 'A Velocity Proxy',
      maxPlayers: 500,
    }
    const cluster = {
      id: `cluster-${Date.now()}`,
      name,
      servers: [],
      defaultProperties: { ...DEFAULT_CLUSTER_PROPERTIES },
      velocity: velocityConfig,
    }
    setInstalling(true)
    onAdd(cluster)
    if (baseDir) {
      const { velocityDir } = await window.api.createClusterDir({ clusterName: name, baseDir })
      await window.api.installVelocity({ velocityDir })
      await window.api.writeVelocityToml({
        velocityDir,
        servers: [],
        port: velocityConfig.port,
        motd: velocityConfig.motd,
        maxPlayers: velocityConfig.maxPlayers,
        forwardingMode: velocityConfig.forwardingMode,
        forwardingSecret: velocityConfig.forwardingSecret,
      })
    }
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={!installing ? onClose : undefined}>
      <div className="modal" style={{ width: 420 }} onClick={e => e.stopPropagation()}>
        <div className="modal-title">クラスターを追加</div>
        <input className="modal-input" placeholder="クラスター名" value={name} onChange={e => setName(e.target.value)} disabled={installing} />
        <input className="modal-input" placeholder="プロキシポート" type="number" value={port} onChange={e => setPort(e.target.value)} disabled={installing} />
        <div style={{ display: 'flex', gap: 6 }}>
          <input className="modal-input" placeholder="転送シークレット" value={secret} onChange={e => setSecret(e.target.value)} disabled={installing} style={{ flex: 1 }} />
          <button className="btn btn-restart" style={{ fontSize: 11, whiteSpace: 'nowrap' }} onClick={() => setSecret(generateSecret())} disabled={installing}>再生成</button>
        </div>
        {logs.length > 0 && (
          <div className="log-box" ref={logRef} style={{ height: 80, marginTop: 8 }}>
            {logs.map((l, i) => <div key={i}>{l}</div>)}
          </div>
        )}
        <div className="modal-actions">
          {!installing && <button className="btn btn-start" onClick={handleSubmit}>追加</button>}
          {installing && <span style={{ color: '#f59e0b', fontSize: 13 }}>Velocityインストール中...</span>}
          {!installing && <button className="btn btn-stop" onClick={onClose}>キャンセル</button>}
        </div>
      </div>
    </div>
  )
}

function ClusterConsole({ cluster, serverLogs, velocityLogs, serverStatuses }) {
  const [consoleTab, setConsoleTab] = useState('velocity')
  const logRef = useRef(null)
  const [command, setCommand] = useState('')

  const currentLogs = consoleTab === 'velocity'
    ? (velocityLogs[cluster.id] || [])
    : (serverLogs[consoleTab] || [])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [currentLogs])

  const handleCommand = async (e) => {
    if (e.key === 'Enter' && command.trim() && consoleTab !== 'velocity') {
      await window.api.sendCommand({ serverId: consoleTab, command: command.trim() })
      setCommand('')
    }
  }

  return (
    <div style={{ marginTop: 12 }}>
      <div className="tab-bar" style={{ marginBottom: 8 }}>
        <button className={`tab-btn ${consoleTab === 'velocity' ? 'active' : ''}`}
          onClick={() => setConsoleTab('velocity')}>Velocity</button>
        {cluster.servers.map(s => (
          <button key={s.id} className={`tab-btn ${consoleTab === s.id ? 'active' : ''}`}
            onClick={() => setConsoleTab(s.id)}>{s.name}</button>
        ))}
      </div>
      <div style={{ position: 'relative' }}>
        <div className="log-box" ref={logRef} style={{ height: 380 }}>
          {currentLogs.length === 0
            ? <span style={{ color: 'var(--text-dim)' }}>ログなし</span>
            : currentLogs.map((l, i) => <div key={i}>{l}</div>)
          }
        </div>
        <button
          style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.12)', color: '#8ab4c8', fontSize: 11, padding: '2px 8px', borderRadius: 4, cursor: 'pointer' }}
          onClick={() => navigator.clipboard.writeText(currentLogs.join('\n'))}
          title="ログをコピー"
        >📋</button>
      </div>
      {consoleTab !== 'velocity' && serverStatuses[consoleTab] === 'running' && (
        <input className="modal-input" style={{ marginTop: 8, width: '100%' }}
          placeholder="コマンドを入力してEnter"
          value={command}
          onChange={e => setCommand(e.target.value)}
          onKeyDown={handleCommand}
        />
      )}
    </div>
  )
}

function ImportModal({ onClose, onImportCluster, onImportStandalone }) {
  const [mode, setMode] = useState(null)
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState(null)
  const [error, setError] = useState('')

  const handleSelectCluster = async () => {
    const folder = await window.api.selectFolder()
    if (!folder) return
    setScanning(true)
    setError('')
    const result = await window.api.scanClusterDir({ clusterDir: folder })
    setScanning(false)
    if (result.success) {
      setScanResult(result)
    } else {
      setError(result.error || 'スキャン失敗')
    }
  }

  const handleSelectStandalone = async () => {
    const folder = await window.api.selectFolder()
    if (!folder) return
    setScanning(true)
    setError('')
    const result = await window.api.scanServerDir({ serverDir: folder })
    setScanning(false)
    if (result.success) {
      onImportStandalone(result)
      onClose()
    } else {
      setError(result.error || 'server.properties が見つかりません')
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ width: 480 }} onClick={e => e.stopPropagation()}>
        <div className="modal-title">インポート</div>

        {!mode && (
          <>
            <p style={{ color: 'var(--text-2)', fontSize: 13, marginBottom: 16 }}>インポートするタイプを選択してください</p>
            <div className="modal-actions">
              <button className="btn btn-start" onClick={() => setMode('cluster')}>クラスター</button>
              <button className="btn btn-restart" onClick={() => setMode('standalone')}>スタンドアロンサーバー</button>
              <button className="btn btn-stop" onClick={onClose}>キャンセル</button>
            </div>
          </>
        )}

        {mode === 'cluster' && !scanResult && (
          <>
            <p style={{ color: 'var(--text-2)', fontSize: 13, marginBottom: 12 }}>
              クラスターフォルダを選択してください。<br />
              <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>サブフォルダにあるサーバーを自動検出します。</span>
            </p>
            {error && <div style={{ color: '#ef4444', fontSize: 12, marginBottom: 8 }}>{error}</div>}
            <div className="modal-actions">
              {!scanning && <button className="btn btn-start" onClick={handleSelectCluster}>フォルダを選択</button>}
              {scanning && <span style={{ color: '#f59e0b', fontSize: 13 }}>スキャン中...</span>}
              <button className="btn btn-restart" onClick={onClose}>キャンセル</button>
            </div>
          </>
        )}

        {mode === 'cluster' && scanResult && (
          <>
            <p style={{ color: '#4ade80', fontSize: 13, marginBottom: 8 }}>スキャン完了: 「{scanResult.clusterName}」</p>
            <div style={{ color: 'var(--text-2)', fontSize: 12, marginBottom: 16 }}>
              <div>検出されたサーバー: {scanResult.servers.length}台</div>
              {scanResult.servers.map(s => (
                <div key={s.serverDir} style={{ color: 'var(--text-accent-2)', paddingLeft: 8 }}>• {s.name}（ポート: {s.port}）</div>
              ))}
              {scanResult.velocityConfig && (
                <div style={{ marginTop: 8, color: 'var(--text-muted)' }}>Velocity: ポート {scanResult.velocityConfig.port}</div>
              )}
            </div>
            <div className="modal-actions">
              <button className="btn btn-start" onClick={() => { onImportCluster(scanResult); onClose() }}>インポート</button>
              <button className="btn btn-restart" onClick={onClose}>キャンセル</button>
            </div>
          </>
        )}

        {mode === 'standalone' && (
          <>
            <p style={{ color: 'var(--text-2)', fontSize: 13, marginBottom: 12 }}>
              サーバーフォルダを選択してください。<br />
              <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>server.properties からポートを読み込みます。</span>
            </p>
            {error && <div style={{ color: '#ef4444', fontSize: 12, marginBottom: 8 }}>{error}</div>}
            <div className="modal-actions">
              {!scanning && <button className="btn btn-start" onClick={handleSelectStandalone}>フォルダを選択</button>}
              {scanning && <span style={{ color: '#f59e0b', fontSize: 13 }}>スキャン中...</span>}
              <button className="btn btn-restart" onClick={onClose}>キャンセル</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function StatusButton({ serverStatus, onStart, onStop, style = {} }) {
  if (!serverStatus) return <button className="btn btn-start" style={style} onClick={onStart}>起動</button>
  if (serverStatus === 'starting') return <button className="btn" style={{ ...style, background: '#f59e0b', color: '#000', opacity: 0.8 }} disabled>起動中...</button>
  if (serverStatus === 'running') return <button className="btn btn-stop" style={style} onClick={onStop}>停止</button>
  if (serverStatus === 'stopping') return <button className="btn" style={{ ...style, background: 'var(--text-muted)', color: '#fff', opacity: 0.8 }} disabled>停止中...</button>
  return null
}

function statusDotClass(s) {
  if (s === 'running') return 'running'
  if (s === 'starting' || s === 'stopping') return 'pending'
  return 'stopped'
}

function ServerCard({ server, onClick, onDelete, onUpdatePort, onStart, onStop, onRestart, serverStatus, conflictInfo, isTry, onToggleTry }) {
  const [showConfirm, setShowConfirm] = useState(false)
  const [deleteFiles, setDeleteFiles] = useState(false)
  const [editingPort, setEditingPort] = useState(false)
  const [portValue, setPortValue] = useState(String(server.port))

  useEffect(() => { setPortValue(String(server.port)) }, [server.port])

  const handlePortSave = (e) => {
    e.stopPropagation()
    const port = parseInt(portValue)
    if (!isNaN(port)) onUpdatePort(port)
    setEditingPort(false)
  }

  return (
    <div className="server-card" style={{ cursor: 'pointer' }} onClick={onClick}>
      <div className="server-card-header">
        <div className="server-name">{server.name}</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div className={`status-dot ${statusDotClass(serverStatus)}`} />
          {!serverStatus && (
            <button className="btn-icon" onClick={e => { e.stopPropagation(); setShowConfirm(true) }} title="削除">✕</button>
          )}
        </div>
      </div>
      <div className="server-info" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        ポート:
        {editingPort ? (
          <span onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: 4 }}>
            <input className="modal-input" style={{ width: 80, padding: '2px 6px', fontSize: 12 }} value={portValue}
              onChange={e => setPortValue(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handlePortSave(e) }} autoFocus />
            <button className="btn btn-start" style={{ padding: '2px 8px', fontSize: 11 }} onClick={handlePortSave}>✓</button>
          </span>
        ) : (
          <span style={{ cursor: 'text', borderBottom: '1px dashed var(--text-dim)' }} onClick={e => { e.stopPropagation(); setEditingPort(true) }}>
            {server.port}
          </span>
        )}
        {conflictInfo && (
          <span
            style={{ fontSize: 13, cursor: 'default' }}
            title={`ポート競合: ${conflictInfo.filter(x => x.name !== server.name).map(x => `${x.name}(${x.source})`).join(', ')}`}
          >⚠️</span>
        )}
      </div>
      <div className="server-info" style={{ fontSize: 11 }}>
        <span style={{ color: 'var(--text-accent-2)' }}>{server.type === 'paper' ? 'Paper' : 'Fabric'}</span>
        {server.mcVersion && <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>{server.mcVersion}</span>}
      </div>
      <div className="server-info" style={{ color: server.individualProperties ? 'var(--text-accent-2)' : 'var(--text-dim)' }}>
        {server.individualProperties ? '個別設定あり' : 'クラスター基本設定'}
      </div>
      {onToggleTry !== undefined && (
        <div style={{ marginTop: 6 }} onClick={e => e.stopPropagation()}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', userSelect: 'none' }}>
            <div
              style={{
                width: 14, height: 14, borderRadius: 3, border: '2px solid',
                borderColor: isTry ? '#f59e0b' : 'var(--border-strong)',
                background: isTry ? '#f59e0b' : 'transparent',
                flexShrink: 0, transition: 'all 0.15s',
              }}
              onClick={onToggleTry}
            />
            <span style={{ fontSize: 11, color: isTry ? '#f59e0b' : 'var(--text-dim)', fontWeight: isTry ? 700 : 400 }}>
              {isTry ? '⭐ メインサーバー' : 'メインサーバーにする'}
            </span>
          </label>
        </div>
      )}
      <div style={{ marginTop: 8, display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
        <StatusButton serverStatus={serverStatus} onStart={onStart} onStop={onStop} style={{ fontSize: 12, padding: '4px 12px' }} />
        {serverStatus === 'running' && (
          <button className="btn btn-restart" style={{ fontSize: 12, padding: '4px 12px' }} onClick={onRestart}>再起動</button>
        )}
      </div>
      {showConfirm && (
        <ConfirmModal
          message={`「${server.name}」を削除しますか？`}
          onConfirm={() => { setShowConfirm(false); onDelete(deleteFiles) }}
          onClose={() => { setShowConfirm(false); setDeleteFiles(false) }}
          checkboxLabel="実ファイルも削除する（元に戻せません）"
          checkboxChecked={deleteFiles}
          onCheckboxChange={setDeleteFiles}
        />
      )}
    </div>
  )
}

function ServerDetail({ server, cluster, onBack, onUpdateServer, serverStatus, onStart, onStop, logs, conflictInfo }) {
  const [subTab, setSubTab] = useState('log')
  const [command, setCommand] = useState('')
  const [loading, setLoading] = useState(true)
  const logRef = useRef(null)
  const saveTimerRef = useRef(null)
  const isFirstLoad = useRef(true)

  const [individualEnabled, setIndividualEnabled] = useState(!!server.individualProperties)
  const [individualProps, setIndividualProps] = useState(null)
  const [jvmMemory, setJvmMemory] = useState(server.jvmMemory || { value: 2, unit: 'G' })
  const [javaPath, setJavaPath] = useState(server.javaPath || '')
  const [javaOptions, setJavaOptions] = useState([])

  useEffect(() => {
    window.api.loadSettings().then(s => {
      setJavaOptions(s.javaInstallations || [])
    })
  }, [])
  const [showWorldDeleteConfirm1, setShowWorldDeleteConfirm1] = useState(false)
  const [showWorldDeleteConfirm2, setShowWorldDeleteConfirm2] = useState(false)

  useEffect(() => {
    setLoading(true)
    if (server.serverDir) {
      window.api.readServerProperties({ serverDir: server.serverDir }).then(props => {
        // ファイルの値 + クラスター基本設定でオーバーライド（個別設定無効時はクラスター設定優先）
        const merged = { ...DEFAULT_PROPERTIES, ...(props || {}) }
        setIndividualProps(merged)
        setLoading(false)
      })
    } else {
      setIndividualProps({ ...DEFAULT_PROPERTIES })
      setLoading(false)
    }
  }, [server.id])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [logs])

  const handleCommand = async (e) => {
    if (e.key === 'Enter' && command.trim()) {
      await window.api.sendCommand({ serverId: server.id, command: command.trim() })
      setCommand('')
    }
  }

  const doSave = async (curIndividualEnabled, curIndividualProps, curJvmMemory, curClusterKeyOverrides) => {
    if (!curIndividualProps) return
    let propsToWrite
    if (curIndividualEnabled) {
      propsToWrite = { ...curIndividualProps, 'server-port': String(server.port) }
    } else {
      propsToWrite = { ...curIndividualProps, ...curClusterKeyOverrides, 'server-port': String(server.port) }
    }
    // online-mode をサーバー種別に応じて強制（クラスター=false、スタンドアロン=true）
    propsToWrite['online-mode'] = cluster ? 'false' : 'true'
    if (server.serverDir) {
      await window.api.writeServerProperties({ serverDir: server.serverDir, properties: propsToWrite })
    }
    onUpdateServer({ ...server, jvmMemory: curJvmMemory, individualProperties: curIndividualEnabled ? { ...propsToWrite } : null })
  }

  useEffect(() => {
    if (isFirstLoad.current) { isFirstLoad.current = false; return }
    const curClusterKeyOverrides = Object.fromEntries(
      CLUSTER_KEYS.map(k => [k, cluster?.defaultProperties?.[k] ?? DEFAULT_PROPERTIES[k]])
    )
    clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => doSave(individualEnabled, individualProps, jvmMemory, curClusterKeyOverrides), 400)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [individualEnabled, individualProps, jvmMemory])

  if (loading || !individualProps) return <div style={{ color: 'var(--text-muted)', padding: 24 }}>読み込み中...</div>

  // クラスターが管理するキーのみ上書き表示
  const clusterKeyOverrides = Object.fromEntries(
    CLUSTER_KEYS.map(k => [k, cluster?.defaultProperties?.[k] ?? DEFAULT_PROPERTIES[k]])
  )
  const displayProps = individualEnabled
    ? individualProps
    : { ...individualProps, ...clusterKeyOverrides }

  const handleChange = (key, value) => {
    // CLUSTER_KEYS は individualEnabled=true のときのみ編集可、それ以外は常に編集可
    if (individualEnabled || !CLUSTER_KEYS.includes(key)) {
      setIndividualProps(prev => ({ ...prev, [key]: value }))
    }
  }

  return (
    <div>
      {conflictInfo && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
          padding: '8px 14px', background: 'rgba(245,158,11,0.12)',
          border: '1px solid rgba(245,158,11,0.4)', borderRadius: 8,
          color: '#f59e0b', fontSize: 13
        }}>
          ⚠️ ポート <strong>{server.port}</strong> が競合しています：
          {conflictInfo.filter(x => x.name !== server.name).map(x => ` ${x.name}（${x.source}）`).join('、')}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button className="btn btn-restart" onClick={onBack}>← 戻る</button>
        <div className="page-title" style={{ marginBottom: 0 }}>{server.name}</div>
        <div className={`status-dot ${statusDotClass(serverStatus)}`} />
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <StatusButton serverStatus={serverStatus} onStart={onStart} onStop={onStop} />
          {serverStatus === 'running' && (
            <button className="btn btn-restart" onClick={async () => { await onStop(); setTimeout(onStart, 3000) }}>再起動</button>
          )}
          {server.serverDir && (
            <button className="btn btn-restart" onClick={() => window.api.openFolder(server.serverDir)}>📁 フォルダ</button>
          )}
          {server.serverDir && (
            <button className="btn btn-restart" onClick={async () => {
              const result = await window.api.backupServer({ serverDir: server.serverDir })
              if (result.success) alert(`バックアップ完了: ${result.backupDir}`)
            }}>💾 バックアップ</button>
          )}
          {server.serverDir && (
            <button className="btn btn-restart" onClick={async () => {
              const dest = await window.api.selectFolder()
              if (!dest) return
              await window.api.copyServerProfile({ srcDir: server.serverDir, destDir: dest + '\\' + server.name + '_copy' })
            }}>📋 コピー</button>
          )}
        </div>
      </div>

      <div className="tab-bar">
        <button className={`tab-btn ${subTab === 'log' ? 'active' : ''}`} onClick={() => setSubTab('log')}>ログ</button>
        <button className={`tab-btn ${subTab === 'settings' ? 'active' : ''}`} onClick={() => setSubTab('settings')}>設定</button>
        {(server.type || 'fabric') === 'fabric' && (
          <button className={`tab-btn ${subTab === 'mods' ? 'active' : ''}`} onClick={() => setSubTab('mods')}>Mod</button>
        )}
        {server.type === 'paper' && (
          <button className={`tab-btn ${subTab === 'plugins' ? 'active' : ''}`} onClick={() => setSubTab('plugins')}>Plugin</button>
        )}
        {cluster && (server.type || 'fabric') === 'fabric' && (
          <button className={`tab-btn ${subTab === 'shared' ? 'active' : ''}`} onClick={() => setSubTab('shared')}>🔗 共有設定</button>
        )}
        <button className={`tab-btn ${subTab === 'performance' ? 'active' : ''}`} onClick={() => setSubTab('performance')}>📊 パフォーマンス</button>
      </div>

      <div className="tab-content">
        {subTab === 'log' && (
          <div>
            <div style={{ position: 'relative' }}>
              <div className="log-box" ref={logRef} style={{ height: 400 }}>
                {logs.length === 0 ? <span style={{ color: 'var(--text-dim)' }}>ログなし</span> : logs.map((l, i) => <div key={i}>{l}</div>)}
              </div>
              <button
                style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.12)', color: '#8ab4c8', fontSize: 11, padding: '2px 8px', borderRadius: 4, cursor: 'pointer' }}
                onClick={() => navigator.clipboard.writeText(logs.join('\n'))}
                title="ログをコピー"
              >📋</button>
            </div>
            {serverStatus === 'running' && (
              <input className="modal-input" style={{ marginTop: 8, width: '100%' }} placeholder="コマンドを入力してEnter"
                value={command} onChange={e => setCommand(e.target.value)} onKeyDown={handleCommand} />
            )}
          </div>
        )}

        {subTab === 'settings' && (
          <div className="settings-section">
            <div style={{ marginBottom: 16, padding: '10px 14px', background: 'var(--bg-card)', borderRadius: 8, border: '1px solid var(--border)' }}>
              <div className="settings-label" style={{ marginBottom: 8 }}>Java</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
                起動時に使用するJavaを選択します。「設定」ページでJavaを追加・検知できます。
              </div>
              <select
                className="modal-input"
                value={javaPath}
                onChange={e => {
                  const val = e.target.value
                  setJavaPath(val)
                  onUpdateServer({ ...server, javaPath: val || null })
                }}
                style={{ width: '100%', cursor: 'pointer' }}
              >
                <option value="">自動 (設定のJavaから最適を選択)</option>
                {javaOptions.map((j, i) => (
                  <option key={i} value={j.path}>
                    Java {j.majorVersion} — {j.path}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: 16, padding: '10px 14px', background: 'var(--bg-card)', borderRadius: 8, border: '1px solid var(--border)' }}>
              <div className="settings-label" style={{ marginBottom: 8 }}>JVM メモリ</div>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="number" min="1" className="modal-input"
                  style={{ width: 90 }}
                  value={jvmMemory.value}
                  onChange={e => setJvmMemory(prev => ({ ...prev, value: Math.max(1, parseInt(e.target.value) || 1) }))}
                />
                <button
                  className={`tab-btn ${jvmMemory.unit === 'G' ? 'active' : ''}`}
                  style={{ fontSize: 12, padding: '4px 12px' }}
                  onClick={() => setJvmMemory(prev => ({ ...prev, unit: 'G' }))}>GB</button>
                <button
                  className={`tab-btn ${jvmMemory.unit === 'M' ? 'active' : ''}`}
                  style={{ fontSize: 12, padding: '4px 12px' }}
                  onClick={() => setJvmMemory(prev => ({ ...prev, unit: 'M' }))}>MB</button>
                <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>→ -Xmx{jvmMemory.value}{jvmMemory.unit}</span>
              </div>
            </div>
            <div style={{ marginBottom: 16, padding: '10px 14px', background: 'var(--bg-card)', borderRadius: 8, border: '1px solid var(--border)' }}>
              <div className="settings-label" style={{ marginBottom: 8 }}>自動再起動</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button
                  style={{
                    padding: '4px 16px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                    background: server.autoRestart ? '#4ade80' : 'var(--border)', color: server.autoRestart ? '#000' : 'var(--text-2)'
                  }}
                  onClick={() => onUpdateServer({ ...server, autoRestart: !server.autoRestart })}
                >
                  {server.autoRestart ? 'ON' : 'OFF'}
                </button>
                <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>クラッシュ時に自動再起動</span>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <div className="settings-label">個別設定</div>
                <div className="settings-description">
                  {individualEnabled ? 'このサーバー専用の設定を使用中' : 'クラスター基本設定を使用中（共通項目はクラスターで管理）'}
                </div>
              </div>
              <button className={`btn ${individualEnabled ? 'btn-stop' : 'btn-restart'}`} onClick={() => setIndividualEnabled(p => !p)}>
                {individualEnabled ? '個別設定を無効化' : '個別設定を有効化'}
              </button>
            </div>
            {!individualEnabled && (
              <div style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 12, padding: '8px 12px', background: 'var(--bg-deep)', borderRadius: 6 }}>
                共通項目（難易度・ゲームモードなど）はクラスターの基本設定で管理されています。個別に変更するには「個別設定を有効化」してください。
              </div>
            )}
            <div style={{ marginBottom: 16 }}>
              <div className="settings-label">ワールドデータ削除</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 8 }}>Shiftキーを押しながらクリック</div>
              <button className="btn btn-stop" style={{ opacity: 0.7 }}
                onClick={(e) => { if (!e.shiftKey) return; setShowWorldDeleteConfirm1(true) }}>
                ワールドを削除
              </button>
            </div>
            <PropertiesEditor
              properties={displayProps}
              onChange={handleChange}
              lockedKeys={individualEnabled ? null : new Set(CLUSTER_KEYS)}
            />
          </div>
        )}
        {(subTab === 'mods' || subTab === 'plugins') && (
          <ModPluginTab server={server} cluster={cluster} onUpdateServer={onUpdateServer} />
        )}
        {subTab === 'shared' && cluster && (
          <InvsyncTab server={server} cluster={cluster} />
        )}
        {subTab === 'performance' && (
          <PerformanceTab servers={[server]} serverStatuses={{ [server.id]: serverStatus }} />
        )}
      </div>
      {showWorldDeleteConfirm1 && (
        <ConfirmModal
          message={`「${server.name}」のワールドデータを削除しますか？\nこの操作は取り消せません。`}
          confirmLabel="削除する"
          confirmClass="btn-stop"
          onConfirm={() => { setShowWorldDeleteConfirm1(false); setShowWorldDeleteConfirm2(true) }}
          onClose={() => setShowWorldDeleteConfirm1(false)}
        />
      )}
      {showWorldDeleteConfirm2 && (
        <ConfirmModal
          message={`本当に削除しますか？ワールドフォルダが完全に消去されます。`}
          confirmLabel="完全に削除"
          confirmClass="btn-stop"
          onConfirm={async () => {
            setShowWorldDeleteConfirm2(false)
            const props = server.serverDir
              ? await window.api.readServerProperties({ serverDir: server.serverDir })
              : null
            await window.api.deleteWorldData({ serverDir: server.serverDir, levelName: props?.['level-name'] || 'world' })
          }}
          onClose={() => setShowWorldDeleteConfirm2(false)}
        />
      )}
    </div>
  )
}

function ClusterSettings({ cluster, onUpdate }) {
  const [properties, setProperties] = useState({ ...DEFAULT_CLUSTER_PROPERTIES, ...(cluster.defaultProperties || {}) })
  const timerRef = useRef(null)

  const handleChange = (key, value) => {
    const next = { ...properties, [key]: value }
    setProperties(next)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => onUpdate({ ...cluster, defaultProperties: next }), 400)
  }

  return (
    <div className="settings-section">
      <div className="settings-label" style={{ marginBottom: 16 }}>クラスター基本設定</div>
      <PropertiesEditor properties={properties} onChange={handleChange} clusterOnly={true} />
    </div>
  )
}

const DEFAULT_VELOCITY = {
  port: 25577,
  forwardingMode: 'modern',
  forwardingSecret: '',
  motd: 'A Velocity Proxy',
  maxPlayers: 500,
}

const generateSecret = () =>
  Array.from({ length: 32 }, () =>
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.charAt(Math.floor(Math.random() * 62))
  ).join('')

function VelocitySettings({ cluster, onUpdate, baseDir }) {
  const [cfg, setCfg] = useState({ ...DEFAULT_VELOCITY, ...(cluster.velocity || {}) })
  const timerRef = useRef(null)

  const set = (key, value) => {
    const next = { ...cfg, [key]: value }
    setCfg(next)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      onUpdate({ ...cluster, velocity: next })
      let velocityDir
      if (cluster.servers.length > 0) {
        velocityDir = `${cluster.servers[0].serverDir.replace(/[\\/][^\\/]+$/, '')}\\velocity`
      } else if (baseDir) {
        velocityDir = `${baseDir}\\${cluster.name}\\velocity`
      }
      if (velocityDir) {
        await window.api.writeVelocityToml({
          velocityDir, servers: cluster.servers,
          port: next.port, motd: next.motd, maxPlayers: next.maxPlayers,
          forwardingMode: next.forwardingMode, forwardingSecret: next.forwardingSecret,
          tryServers: next.tryServers || [],
        })
      }
    }, 400)
  }

  return (
    <div className="settings-section">
      <div className="settings-label" style={{ marginBottom: 16 }}>Velocity プロキシ設定</div>

      <div className="properties-grid">
        <div className="property-row">
          <div className="property-key">プロキシポート</div>
          <input className="modal-input property-value" type="number" value={cfg.port}
            onChange={e => set('port', parseInt(e.target.value) || 25577)} />
        </div>
        <div className="property-row">
          <div className="property-key">転送モード</div>
          <select className="modal-input property-value" value={cfg.forwardingMode} onChange={e => set('forwardingMode', e.target.value)}>
            <option value="modern">modern（推奨）</option>
            <option value="legacy">legacy</option>
            <option value="bungeeguard">bungeeguard</option>
            <option value="none">none</option>
          </select>
        </div>
        {(cfg.forwardingMode === 'modern' || cfg.forwardingMode === 'bungeeguard') && (
          <div className="property-row">
            <div className="property-key">転送シークレット</div>
            <div style={{ display: 'flex', gap: 4, flex: 1 }}>
              <input className="modal-input property-value" style={{ flex: 1 }} value={cfg.forwardingSecret}
                onChange={e => set('forwardingSecret', e.target.value)} placeholder="シークレットキー" />
              <button className="btn btn-restart" style={{ fontSize: 11, padding: '3px 8px', whiteSpace: 'nowrap' }}
                onClick={() => set('forwardingSecret', Array.from({ length: 32 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.charAt(Math.floor(Math.random() * 62))).join(''))}>
                ランダム生成
              </button>
            </div>
          </div>
        )}
        <div className="property-row">
          <div className="property-key">MOTD</div>
          <input className="modal-input property-value" value={cfg.motd}
            onChange={e => set('motd', e.target.value)} />
        </div>
        <div className="property-row">
          <div className="property-key">最大プレイヤー数</div>
          <input className="modal-input property-value" type="number" value={cfg.maxPlayers}
            onChange={e => set('maxPlayers', parseInt(e.target.value) || 500)} />
        </div>
      </div>

      <div style={{ marginTop: 16, padding: '10px 12px', background: 'var(--bg-deep)', borderRadius: 6, fontSize: 12, color: 'var(--text-muted)' }}>
        バックエンドサーバー（{cluster.servers.length}台）：
        {cluster.servers.length === 0
          ? <span style={{ color: 'var(--text-dim)' }}> なし</span>
          : cluster.servers.map(s => (
            <span key={s.id} style={{ marginLeft: 8, color: 'var(--text-accent-2)' }}>{s.name}:{s.port}</span>
          ))
        }
      </div>
    </div>
  )
}

// ─── Config Editor Modal ──────────────────────────────────────────────────────

function ConfigEditorModal({ filename, filePath, onClose }) {
  const [content, setContent] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    window.api.readConfigFile({ filePath }).then(c => setContent(c ?? ''))
  }, [filePath])

  const handleSave = async () => {
    setSaving(true)
    await window.api.writeConfigFile({ filePath, content })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ width: 680, maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
        <div className="modal-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>⚙ {filename}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 18 }}>✕</button>
        </div>
        {content === null ? (
          <div style={{ color: 'var(--text-muted)', padding: 16 }}>読み込み中...</div>
        ) : (
          <>
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              style={{
                flex: 1, minHeight: 400, fontFamily: 'monospace', fontSize: 12,
                background: 'var(--bg-deep)', color: 'var(--text)', border: '1px solid var(--border)',
                borderRadius: 6, padding: 12, resize: 'vertical', outline: 'none',
                lineHeight: 1.5
              }}
              spellCheck={false}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              {saved && <span style={{ color: '#4ade80', fontSize: 12, alignSelf: 'center' }}>保存完了</span>}
              <button className="btn btn-restart" onClick={onClose}>閉じる</button>
              <button className="btn btn-start" onClick={handleSave} disabled={saving}>{saving ? '保存中...' : '保存'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Player Management Tab ────────────────────────────────────────────────────

function PlayerTab({ cluster, velocityLogs, serverLogs, serverStatuses, onSendCommand }) {
  const [players, setPlayers] = useState([]) // { name, uuid, server }
  const [opData, setOpData] = useState({})   // { serverId: [{ uuid, name, level }] }
  const [expanded, setExpanded] = useState(null)
  const [fetchingUuid, setFetchingUuid] = useState({})
  const [uuidCache, setUuidCache] = useState({})
  const [tpTarget, setTpTarget] = useState({}) // { playerName: 'x y z' }
  const processedRef = useRef(0)
  const processedServerRef = useRef({})

  // Parse Velocity logs to track online players (only new lines)
  useEffect(() => {
    const logs = velocityLogs || []
    const prevLen = processedRef.current
    if (logs.length <= prevLen) return
    const newLines = logs.slice(prevLen)
    processedRef.current = logs.length

    setPlayers(prev => {
      let current = [...prev]
      for (const line of newLines) {
        // Connected
        const connectMatch = line.match(/\[connected player ([A-Za-z0-9_]{2,16})[/ ]/) ||
          line.match(/Player ([A-Za-z0-9_]{2,16}) (?:joined|connected|logged in)/)
        if (connectMatch) {
          const name = connectMatch[1]
          if (!current.find(p => p.name === name)) {
            current = [...current, { name, uuid: uuidCache[name] || null, server: null }]
          }
        }
        // Disconnected
        const disconnectMatch = line.match(/\[connected player ([A-Za-z0-9_]{2,16})[/ ].*(?:disconnect|left)/) ||
          line.match(/Player ([A-Za-z0-9_]{2,16}) (?:disconnected|left|logged out)/)
        if (disconnectMatch) {
          current = current.filter(p => p.name !== disconnectMatch[1])
        }
        // Server switch: "username -> servername"
        const switchMatch = line.match(/([A-Za-z0-9_]{2,16}) -> ([A-Za-z0-9_-]+)/)
        if (switchMatch) {
          const [, name, serverName] = switchMatch
          current = current.map(p => p.name === name ? { ...p, server: serverName } : p)
        }
      }
      return current
    })
  }, [velocityLogs])

  // Also parse server logs for join/leave (only new lines)
  useEffect(() => {
    setPlayers(prev => {
      let current = [...prev]
      for (const server of cluster.servers) {
        const logs = serverLogs?.[server.id] || []
        const prevLen = processedServerRef.current[server.id] || 0
        if (logs.length <= prevLen) continue
        const newLines = logs.slice(prevLen)
        processedServerRef.current = { ...processedServerRef.current, [server.id]: logs.length }
        for (const line of newLines) {
          const joinMatch = line.match(/([A-Za-z0-9_]{2,16})\[\/[\d.:]+\] logged in/) ||
            line.match(/([A-Za-z0-9_]{2,16}) joined the game/)
          if (joinMatch) {
            const name = joinMatch[1]
            current = current.find(p => p.name === name)
              ? current.map(p => p.name === name ? { ...p, server: server.name } : p)
              : [...current, { name, uuid: null, server: server.name }]
          }
          const leaveMatch = line.match(/([A-Za-z0-9_]{2,16}) left the game/)
          if (leaveMatch) {
            current = current.filter(p => p.name !== leaveMatch[1])
          }
        }
      }
      return current
    })
  }, [serverLogs])

  // Load OP data for all servers
  const refreshOps = async () => {
    const result = {}
    for (const s of cluster.servers) {
      if (!s.serverDir) continue
      result[s.id] = await window.api.getOps({ serverDir: s.serverDir })
    }
    setOpData(result)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { refreshOps() }, [cluster.id])

  const isOp = (playerName, serverId) => {
    const ops = opData[serverId] || []
    return ops.some(o => o.name?.toLowerCase() === playerName.toLowerCase())
  }

  const isOpAllServers = (playerName) => cluster.servers.every(s => isOp(playerName, s.id))

  const getUuid = async (name) => {
    if (uuidCache[name]) return uuidCache[name]
    setFetchingUuid(prev => ({ ...prev, [name]: true }))
    const result = await window.api.fetchUuid({ username: name })
    setFetchingUuid(prev => ({ ...prev, [name]: false }))
    if (result.uuid) {
      setUuidCache(prev => ({ ...prev, [name]: result.uuid }))
      setPlayers(prev => prev.map(p => p.name === name ? { ...p, uuid: result.uuid } : p))
      return result.uuid
    }
    return null
  }

  const handleOp = async (playerName, serverId, grant) => {
    const server = cluster.servers.find(s => s.id === serverId)
    if (!server?.serverDir) return
    let uuid = uuidCache[playerName] || players.find(p => p.name === playerName)?.uuid
    if (!uuid) uuid = await getUuid(playerName)
    const currentOps = opData[serverId] || []
    let newOps
    if (grant) {
      if (currentOps.find(o => o.name?.toLowerCase() === playerName.toLowerCase())) return
      newOps = [...currentOps, { uuid: uuid || '', name: playerName, level: 4, bypassesPlayerLimit: false }]
      if (serverStatuses[serverId]) onSendCommand(serverId, `/op ${playerName}`)
    } else {
      newOps = currentOps.filter(o => o.name?.toLowerCase() !== playerName.toLowerCase())
      if (serverStatuses[serverId]) onSendCommand(serverId, `/deop ${playerName}`)
    }
    await window.api.setOps({ serverDir: server.serverDir, ops: newOps })
    setOpData(prev => ({ ...prev, [serverId]: newOps }))
  }

  const handleOpAll = async (playerName, grant) => {
    for (const s of cluster.servers) {
      await handleOp(playerName, s.id, grant)
    }
  }

  const handleKill = (playerName) => {
    const runningServers = cluster.servers.filter(s => serverStatuses[s.id])
    for (const s of runningServers) onSendCommand(s.id, `/kill ${playerName}`)
  }

  const handleTp = (playerName, serverId) => {
    const coords = tpTarget[playerName] || ''
    if (!coords.trim()) return
    onSendCommand(serverId, `/tp ${playerName} ${coords.trim()}`)
  }

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div className="settings-label">プレイヤー管理</div>
        <button className="btn btn-restart" style={{ fontSize: 12 }} onClick={refreshOps}>OP情報更新</button>
      </div>
      {players.length === 0 ? (
        <div style={{
          padding: '16px', borderRadius: 8, background: 'var(--bg-card)', border: '1px solid var(--border)',
          color: 'var(--text-muted)', fontSize: 13, textAlign: 'center'
        }}>
          オンラインのプレイヤーがいません
          <div style={{ fontSize: 11, marginTop: 4, color: 'var(--text-dim)' }}>Velocityログからプレイヤーの参加・退出を検出します</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {players.map(player => {
            const isExpanded = expanded === player.name
            const allOp = isOpAllServers(player.name)
            return (
              <div key={player.name} style={{
                border: '1px solid var(--border)', borderRadius: 8,
                background: 'var(--bg-card)', overflow: 'hidden'
              }}>
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer' }}
                  onClick={() => setExpanded(isExpanded ? null : player.name)}
                >
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: '#4ade80', flexShrink: 0
                  }} />
                  <span style={{ fontWeight: 600, color: 'var(--text)', fontSize: 14 }}>{player.name}</span>
                  {player.server && (
                    <span style={{ fontSize: 11, color: 'var(--text-accent-2)', background: 'rgba(99,102,241,0.1)', padding: '1px 7px', borderRadius: 99 }}>
                      {player.server}
                    </span>
                  )}
                  {allOp && (
                    <span style={{ fontSize: 11, color: '#f59e0b', background: 'rgba(245,158,11,0.1)', padding: '1px 7px', borderRadius: 99 }}>⭐ OP</span>
                  )}
                  <div style={{ flex: 1 }} />
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      className={`btn ${allOp ? 'btn-stop' : 'btn-start'}`}
                      style={{ fontSize: 11, padding: '3px 10px' }}
                      onClick={e => { e.stopPropagation(); handleOpAll(player.name, !allOp) }}
                    >
                      {allOp ? '全サーバーOP剥奪' : '全サーバーOP付与'}
                    </button>
                    <button
                      className="btn btn-stop"
                      style={{ fontSize: 11, padding: '3px 10px' }}
                      onClick={e => { e.stopPropagation(); handleKill(player.name) }}
                    >
                      Kill
                    </button>
                  </div>
                  <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>{isExpanded ? '▲' : '▼'}</span>
                </div>

                {isExpanded && (
                  <div style={{ borderTop: '1px solid var(--border)', padding: '10px 14px', background: 'var(--bg-section)' }}>
                    {/* UUID */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 12 }}>
                      <span style={{ color: 'var(--text-muted)', minWidth: 40 }}>UUID:</span>
                      {player.uuid
                        ? <span style={{ fontFamily: 'monospace', color: 'var(--text-dim)' }}>{player.uuid}</span>
                        : (
                          <button
                            className="btn btn-restart"
                            style={{ fontSize: 11, padding: '2px 8px' }}
                            disabled={fetchingUuid[player.name]}
                            onClick={() => getUuid(player.name)}
                          >
                            {fetchingUuid[player.name] ? '取得中...' : 'UUID取得'}
                          </button>
                        )
                      }
                    </div>

                    {/* Per-server OP */}
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>サーバー別 OP権限</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {cluster.servers.map(s => {
                          const op = isOp(player.name, s.id)
                          return (
                            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 10px', borderRadius: 6, background: 'var(--bg-card)' }}>
                              <span style={{ flex: 1, fontSize: 12, color: 'var(--text)' }}>{s.name}</span>
                              <span style={{ fontSize: 11, color: op ? '#4ade80' : 'var(--text-dim)' }}>
                                {op ? '⭐ OP' : 'OP なし'}
                              </span>
                              <button
                                className={`btn ${op ? 'btn-stop' : 'btn-start'}`}
                                style={{ fontSize: 11, padding: '2px 8px' }}
                                onClick={() => handleOp(player.name, s.id, !op)}
                              >
                                {op ? '剥奪' : '付与'}
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    {/* TP */}
                    <div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>テレポート (X Y Z)</div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <input
                          className="modal-input"
                          style={{ flex: 1, fontSize: 12 }}
                          placeholder="100 64 200"
                          value={tpTarget[player.name] || ''}
                          onChange={e => setTpTarget(prev => ({ ...prev, [player.name]: e.target.value }))}
                        />
                        {cluster.servers.map(s => serverStatuses[s.id] ? (
                          <button
                            key={s.id}
                            className="btn btn-restart"
                            style={{ fontSize: 11, padding: '4px 10px', whiteSpace: 'nowrap' }}
                            onClick={() => handleTp(player.name, s.id)}
                          >
                            TP → {s.name}
                          </button>
                        ) : null)}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function VelocityPluginTab({ cluster, settings, onUpdateCluster }) {
  const [velocitySources, setVelocitySources] = useState([])
  const [libraryPlugins, setLibraryPlugins] = useState([])
  const [enabled, setEnabled] = useState(cluster.enabledPlugins || [])
  const [applying, setApplying] = useState(false)
  const [applied, setApplied] = useState(false)
  const [configModal, setConfigModal] = useState(null)
  const [configPicker, setConfigPicker] = useState(null)

  const velocityDir = settings?.baseDir ? `${settings.baseDir}\\${cluster.name}\\velocity` : null

  const openConfig = async (e, filename) => {
    e.stopPropagation()
    if (!velocityDir) return
    const configs = await window.api.listModConfigs({ serverDir: velocityDir, modFilename: filename })
    if (configs.length === 0) return
    if (configs.length === 1) setConfigModal({ filename: configs[0].filename, filePath: configs[0].path })
    else setConfigPicker({ modFilename: filename, configs })
  }

  useEffect(() => {
    window.api.getLibraryStructure().then(result => {
      const sources = result.velocitySources || []
      setVelocitySources(sources)
      setLibraryPlugins(sources.flatMap(s => s.files))
    })
  }, [])

  const toggle = (filename) => {
    setEnabled(prev => prev.includes(filename) ? prev.filter(f => f !== filename) : [...prev, filename])
  }

  const handleApply = async () => {
    if (!settings?.baseDir || velocitySources.length === 0) return
    setApplying(true)
    const velocityDir = `${settings.baseDir}\\${cluster.name}\\velocity`
    await window.api.applyServerPlugins({ serverDir: velocityDir, enabledPlugins: enabled, librarySources: velocitySources })
    onUpdateCluster({ ...cluster, enabledPlugins: enabled })
    setApplying(false)
    setApplied(true)
    setTimeout(() => setApplied(false), 2000)
  }

  return (
    <div className="settings-section" style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="settings-label">Velocity Plugin 選択</div>
          {libraryPlugins.length > 0 && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)' }}>
              <div
                style={{
                  width: 14, height: 14, borderRadius: 3, border: '2px solid',
                  borderColor: enabled.length === libraryPlugins.length && libraryPlugins.length > 0 ? '#4ade80' : 'var(--border-strong)',
                  background: enabled.length === libraryPlugins.length && libraryPlugins.length > 0 ? '#4ade80' : 'transparent',
                  flexShrink: 0, cursor: 'pointer'
                }}
                onClick={() => setEnabled(enabled.length === libraryPlugins.length ? [] : [...libraryPlugins])}
              />
              すべて選択
            </label>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {applied && <span style={{ color: '#4ade80', fontSize: 12 }}>適用完了</span>}
          <button className="btn btn-start" onClick={handleApply} disabled={applying}>
            {applying ? '適用中...' : '適用'}
          </button>
        </div>
      </div>
      <div style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 12, padding: '6px 10px', background: 'var(--bg-deep)', borderRadius: 6 }}>
        選択したPluginはVelocityの plugins/ フォルダに配置されます
      </div>
      {velocitySources.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
          Velocity Pluginフォルダが登録されていません。「Mod管理」ページから登録してください。
        </div>
      ) : libraryPlugins.length === 0 ? (
        <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>
          ライブラリにPluginがありません。「Mod管理」ページから追加してください。
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {libraryPlugins.map(filename => (
            <div key={filename} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '8px 12px', background: 'var(--bg-card)', borderRadius: 6, border: '1px solid var(--border)',
              cursor: 'pointer'
            }} onClick={() => toggle(filename)}>
              <div style={{
                width: 16, height: 16, borderRadius: 3, border: '2px solid',
                borderColor: enabled.includes(filename) ? '#4ade80' : 'var(--border-strong)',
                background: enabled.includes(filename) ? '#4ade80' : 'transparent',
                flexShrink: 0
              }} />
              <span style={{ color: 'var(--text)', fontSize: 13, flex: 1 }}>{filename}</span>
              {velocityDir && (
                <button
                  onClick={(e) => openConfig(e, filename)}
                  title="Config編集"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', fontSize: 14, padding: '0 2px', lineHeight: 1 }}
                >⚙</button>
              )}
            </div>
          ))}
        </div>
      )}
      {configModal && (
        <ConfigEditorModal
          filename={configModal.filename}
          filePath={configModal.filePath}
          onClose={() => setConfigModal(null)}
        />
      )}
      {configPicker && (
        <div className="modal-overlay" onClick={() => setConfigPicker(null)}>
          <div className="modal" style={{ width: 420 }} onClick={e => e.stopPropagation()}>
            <div className="modal-title">Config ファイルを選択</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>{configPicker.modFilename}</div>
            {configPicker.configs.map(c => (
              <div key={c.path} style={{
                padding: '8px 12px', borderRadius: 6, background: 'var(--bg-card)', border: '1px solid var(--border)',
                cursor: 'pointer', marginBottom: 6, fontSize: 13, color: 'var(--text)'
              }} onClick={() => { setConfigModal({ filename: c.filename, filePath: c.path }); setConfigPicker(null) }}>
                {c.filename}
              </div>
            ))}
            <button className="btn btn-restart" style={{ marginTop: 8, width: '100%' }} onClick={() => setConfigPicker(null)}>キャンセル</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── 必須Mod 警告モーダル ────────────────────────────────────────────────────
function RequiredModsWarnModal({ server, cluster, missing, onRepairAndStart, onStartAnyway, onClose }) {
  const [repairing, setRepairing] = useState(false)
  const handleRepair = async () => {
    setRepairing(true)
    await onRepairAndStart()
    setRepairing(false)
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-title">⚠ 必須Modが見つかりません</div>
        <p style={{ color: 'var(--text-2)', fontSize: 14, marginBottom: 8 }}>
          {cluster ? `「${cluster.name}」クラスターの` : ''}「{server.name}」のmodsフォルダに以下のModが見つかりませんでした:
        </p>
        <ul style={{ margin: '0 0 14px 16px', padding: 0, color: '#ef4444', fontSize: 13 }}>
          {missing.map(m => <li key={m}>{m}</li>)}
        </ul>
        <p style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 14 }}>
          これらのModはクラスター機能に必要です。再インストールしますか？
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-start" onClick={handleRepair} disabled={repairing}>
            {repairing ? '修復中...' : '🔧 再インストールして起動'}
          </button>
          <button className="btn btn-restart" onClick={onStartAnyway} disabled={repairing}>
            このまま起動
          </button>
          <button className="btn" onClick={onClose} disabled={repairing}
            style={{ background: 'var(--border)', color: 'var(--text-2)' }}>
            キャンセル
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Invsync 共有設定タブ ────────────────────────────────────────────────────
function InvsyncTab({ server, cluster }) {
  const [versions, setVersions] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedVersion, setSelectedVersion] = useState(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null) // { success, error }
  const [installed, setInstalled] = useState(null) // { installed, fileName }

  useEffect(() => {
    const init = async () => {
      setLoading(true)
      const [vers, status] = await Promise.all([
        window.api.invsyncListVersions(),
        server.serverDir ? window.api.invsyncCheck({ serverDir: server.serverDir }) : Promise.resolve({ installed: false })
      ])
      setVersions(vers)
      setInstalled(status)
      if (vers.length > 0) {
        const match = vers.find(v => v.mcVersion === server.mcVersion) || vers[0]
        setSelectedVersion(match.tag)
      }
      setLoading(false)
    }
    init()
  }, [server.id])

  const isCompatible = (ver) => {
    if (!server.mcVersion) return null
    const mcVer = server.mcVersion.trim()
    const modVer = ver.mcVersion.trim()
    return modVer === mcVer || mcVer.startsWith(modVer) || modVer.startsWith(mcVer)
  }

  const handleToggle = async () => {
    if (busy || !server.serverDir) return
    setBusy(true)
    setResult(null)

    if (installed?.installed) {
      // OFF → アンインストール
      const res = await window.api.invsyncUninstall({ serverDir: server.serverDir })
      setResult(res.success ? null : { success: false, error: res.error })
      if (res.success) {
        setInstalled({ installed: false, fileName: null })
      }
    } else {
      // ON → インストール
      const ver = versions.find(v => v.tag === selectedVersion)
      if (!ver) { setBusy(false); return }
      const res = await window.api.invsyncInstall({
        serverDir: server.serverDir,
        downloadUrl: ver.downloadUrl,
        fileName: ver.fileName,
        serverName: server.name,
        clusterName: cluster?.name,
      })
      setResult(res.success ? { success: true } : { success: false, error: res.error })
      if (res.success) {
        const status = await window.api.invsyncCheck({ serverDir: server.serverDir })
        setInstalled(status)
      }
    }
    setBusy(false)
  }

  if (loading) return <div style={{ color: 'var(--text-muted)', padding: 16 }}>読み込み中...</div>

  const isOn = !!installed?.installed

  return (
    <div style={{ padding: '16px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 概要 */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 18px' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>インベントリ共有（Invsync）</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          クラスター内のFabricサーバー間でインベントリを共有します。
          同じクラスターのMariaDBに接続して、プレイヤーデータを同期します。
        </div>
      </div>

      {/* トグルカード */}
      <div style={{ background: 'var(--bg-card)', border: `1px solid ${isOn ? 'rgba(34,197,94,0.35)' : 'var(--border)'}`, borderRadius: 10, padding: '16px 18px' }}>
        {/* トグル行 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: isOn ? 0 : 16 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 3 }}>インベントリ同期</div>
            {isOn ? (
              <div style={{ fontSize: 12, color: '#22c55e' }}>有効 — {installed.fileName}</div>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>無効</div>
            )}
          </div>
          {/* トグルスイッチ */}
          <button
            onClick={handleToggle}
            disabled={busy || (!isOn && versions.length === 0)}
            style={{
              position: 'relative', width: 48, height: 26, borderRadius: 99, border: 'none', cursor: busy ? 'wait' : 'pointer',
              background: busy ? '#6b7280' : isOn ? '#22c55e' : '#374151',
              transition: 'background 0.2s', flexShrink: 0, padding: 0,
            }}
            title={isOn ? 'クリックしてアンインストール' : 'クリックしてインストール'}
          >
            <span style={{
              position: 'absolute', top: 3, left: isOn ? 24 : 3,
              width: 20, height: 20, borderRadius: '50%', background: '#fff',
              transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
            }} />
          </button>
        </div>

        {/* OFF のときだけバージョン選択を表示 */}
        {!isOn && (
          <div>
            {versions.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 2 }}>インストールするバージョン:</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 160, overflowY: 'auto' }}>
                  {versions.map(v => {
                    const compat = isCompatible(v)
                    return (
                      <label key={v.tag} style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px',
                        borderRadius: 6, cursor: 'pointer',
                        background: selectedVersion === v.tag ? 'rgba(var(--accent-rgb,99,102,241),0.1)' : 'var(--bg-section)',
                        border: selectedVersion === v.tag ? '1px solid var(--text-accent)' : '1px solid transparent',
                      }}>
                        <input type="radio" name="invsync-ver" value={v.tag} checked={selectedVersion === v.tag}
                          onChange={() => setSelectedVersion(v.tag)} />
                        <span style={{ fontSize: 12, flex: 1, color: 'var(--text)' }}>{v.tag}</span>
                        {compat !== null && (
                          <span style={{
                            fontSize: 11, padding: '2px 7px', borderRadius: 99, fontWeight: 600,
                            background: compat ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.1)',
                            color: compat ? '#15803d' : '#b91c1c',
                            border: `1px solid ${compat ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.2)'}`,
                          }}>
                            {compat ? '互換性あり' : '互換性なし'}
                          </span>
                        )}
                      </label>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 12, color: '#f59e0b' }}>
                ⚠ バージョン一覧を取得できませんでした。インターネット接続を確認してください。
              </div>
            )}
          </div>
        )}

        {/* 処理中・結果表示 */}
        {busy && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10 }}>
            {isOn ? 'アンインストール中...' : 'インストール中...'}
          </div>
        )}
        {result && !result.success && (
          <div style={{ fontSize: 12, color: '#ef4444', marginTop: 10 }}>
            ⚠ {result.error}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── クラスター DB タブ ──────────────────────────────────────────────────────
function ClusterDbTab({ cluster, dbRunning }) {
  const schemaName = `${cluster.name.replace(/[^a-zA-Z0-9_]/g, '_')}_DB`
  const [creating, setCreating] = useState(false)
  const [createResult, setCreateResult] = useState(null)

  const createSchema = async () => {
    setCreating(true)
    setCreateResult(null)
    const res = await window.api.dbCreateSchema({ clusterName: cluster.name })
    setCreateResult(res)
    setCreating(false)
  }

  return (
    <div style={{ padding: '16px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* グローバルDB状態 */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 18px' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 10 }}>データベース接続状態</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            width: 10, height: 10, borderRadius: '50%',
            background: dbRunning ? '#22c55e' : '#ef4444',
            boxShadow: dbRunning ? '0 0 6px #22c55e' : '0 0 6px #ef4444',
            flexShrink: 0
          }} />
          <span style={{ fontSize: 13, color: dbRunning ? '#22c55e' : '#ef4444', fontWeight: 600 }}>
            {dbRunning ? 'MariaDB 稼働中' : 'MariaDB 停止中'}
          </span>
        </div>
        {!dbRunning && (
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
            DBを使用するには、設定 &gt; SQL/DB タブから MariaDB を起動してください。
          </div>
        )}
      </div>

      {/* クラスター用スキーマ */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 18px' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 10 }}>クラスター専用スキーマ</div>
        <div style={{ display: 'flex', gap: 16, fontSize: 12, marginBottom: 8 }}>
          <span style={{ minWidth: 80, color: 'var(--text-muted)', fontWeight: 600 }}>スキーマ名</span>
          <code style={{ color: 'var(--text)', fontFamily: 'monospace' }}>{schemaName}</code>
        </div>
        <div style={{ display: 'flex', gap: 16, fontSize: 12, marginBottom: 12 }}>
          <span style={{ minWidth: 80, color: 'var(--text-muted)', fontWeight: 600 }}>用途</span>
          <span style={{ color: 'var(--text-muted)' }}>Invsync によるクラスター内インベントリ共有</span>
        </div>
        <button
          className="btn btn-restart"
          onClick={createSchema}
          disabled={!dbRunning || creating}
          style={{ fontSize: 12 }}
        >
          {creating ? '作成中...' : '🔄 スキーマを作成/確認'}
        </button>
        {createResult && (
          <div style={{ marginTop: 8, fontSize: 12, color: createResult.success ? '#22c55e' : '#ef4444' }}>
            {createResult.success ? '✓ スキーマを確認しました' : `⚠ ${createResult.error}`}
          </div>
        )}
        {!dbRunning && (
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-dim)' }}>
            ※ MariaDB が起動しているときはクラスター作成時に自動生成されます
          </div>
        )}
      </div>
    </div>
  )
}

// ─── ユーティリティ ────────────────────────────────────────────────────────
function fmtBytes(bytes) {
  if (bytes == null) return '—'
  if (bytes >= 1024 ** 3) return (bytes / 1024 ** 3).toFixed(1) + ' GB'
  if (bytes >= 1024 ** 2) return (bytes / 1024 ** 2).toFixed(0) + ' MB'
  if (bytes >= 1024) return (bytes / 1024).toFixed(0) + ' KB'
  return bytes + ' B'
}

function GaugeBar({ value, max, color }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
      <div style={{ flex: 1, height: 8, borderRadius: 99, background: 'var(--bg-section)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 99, background: color, transition: 'width 0.4s' }} />
      </div>
      <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 38, textAlign: 'right' }}>{pct.toFixed(0)}%</span>
    </div>
  )
}

// パフォーマンスタブ（クラスター / スタンドアロン共用）
function PerformanceTab({ servers, serverStatuses }) {
  const [stats, setStats] = useState({})       // { serverId: { cpu, memory } }
  const [diskSizes, setDiskSizes] = useState({}) // { serverId: bytes }
  const [diskLoading, setDiskLoading] = useState({}) // { serverId: true }
  const intervalRef = useRef(null)

  const runningIds = servers.filter(s => serverStatuses[s.id]).map(s => s.id)

  // CPU / メモリ ポーリング（3秒ごと）
  useEffect(() => {
    const poll = async () => {
      if (runningIds.length === 0) return
      const result = await window.api.getProcessStats(runningIds)
      if (result) setStats(prev => ({ ...prev, ...result }))
    }
    poll()
    intervalRef.current = setInterval(poll, 3000)
    return () => clearInterval(intervalRef.current)
  }, [runningIds.join(',')])

  // ディスクサイズ（初回 & サーバーリスト変化時 & 5分ごとに再計算）
  const calcDiskSizes = useCallback(() => {
    for (const srv of servers) {
      if (!srv.serverDir) continue
      setDiskLoading(prev => ({ ...prev, [srv.id]: true }))
      window.api.getDirSize(srv.serverDir).then(({ bytes }) => {
        setDiskSizes(prev => ({ ...prev, [srv.id]: bytes }))
        setDiskLoading(prev => { const n = { ...prev }; delete n[srv.id]; return n })
      })
    }
  }, [servers.map(s => s.id).join(',')])

  useEffect(() => {
    calcDiskSizes()
    const diskTimer = setInterval(calcDiskSizes, 5 * 60 * 1000)
    return () => clearInterval(diskTimer)
  }, [calcDiskSizes])

  const refreshDisk = async (srv) => {
    if (!srv.serverDir) return
    setDiskLoading(prev => ({ ...prev, [srv.id]: true }))
    const { bytes } = await window.api.getDirSize(srv.serverDir)
    setDiskSizes(prev => ({ ...prev, [srv.id]: bytes }))
    setDiskLoading(prev => { const n = { ...prev }; delete n[srv.id]; return n })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
      {servers.length === 0 && (
        <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>サーバーがありません</div>
      )}
      {servers.map(srv => {
        const running = !!serverStatuses[srv.id]
        const s = stats[srv.id]
        const disk = diskSizes[srv.id]
        const MAX_MEMORY_GB = (srv.jvmMemory?.value || 2) * (srv.jvmMemory?.unit === 'M' ? 1 : 1024) * 1024 * 1024

        return (
          <div key={srv.id} style={{
            background: 'var(--bg-card)', border: `1px solid ${running ? 'rgba(34,197,94,0.25)' : 'var(--border)'}`,
            borderRadius: 10, padding: '14px 18px',
          }}>
            {/* ヘッダー */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <span style={{
                width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                background: running ? '#22c55e' : '#6b7280',
                boxShadow: running ? '0 0 5px #22c55e' : 'none',
              }} />
              <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', flex: 1 }}>{srv.name}</span>
              <span style={{ fontSize: 11, color: 'var(--text-dim)', background: 'var(--bg-section)', padding: '2px 8px', borderRadius: 99 }}>
                {srv.type === 'paper' ? 'Paper' : 'Fabric'}
              </span>
              {!running && (
                <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>停止中</span>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* CPU */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 60 }}>CPU</span>
                {running && s ? (
                  <GaugeBar value={s.cpu} max={100} color="linear-gradient(90deg,#6366f1,#8b5cf6)" />
                ) : (
                  <span style={{ fontSize: 12, color: 'var(--text-dim)', flex: 1 }}>
                    {running ? '取得中...' : '—'}
                  </span>
                )}
                {running && s && (
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', minWidth: 42, textAlign: 'right' }}>
                    {s.cpu.toFixed(1)}%
                  </span>
                )}
              </div>

              {/* メモリ */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 60 }}>メモリ</span>
                {running && s ? (
                  <GaugeBar value={s.memory} max={MAX_MEMORY_GB} color="linear-gradient(90deg,#06b6d4,#0284c7)" />
                ) : (
                  <span style={{ fontSize: 12, color: 'var(--text-dim)', flex: 1 }}>
                    {running ? '取得中...' : '—'}
                  </span>
                )}
                {running && s && (
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', minWidth: 80, textAlign: 'right' }}>
                    {fmtBytes(s.memory)} / {fmtBytes(MAX_MEMORY_GB)}
                  </span>
                )}
              </div>

              {/* ディスク */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 60 }}>ディスク</span>
                <span style={{ fontSize: 12, color: 'var(--text)', flex: 1 }}>
                  {diskLoading[srv.id] ? '計算中...' : disk != null ? fmtBytes(disk) : '—'}
                </span>
                <button
                  onClick={() => refreshDisk(srv)}
                  disabled={diskLoading[srv.id]}
                  style={{ background: 'none', border: 'none', cursor: diskLoading[srv.id] ? 'wait' : 'pointer', color: 'var(--text-dim)', fontSize: 13, padding: '0 4px' }}
                  title="再計算"
                >🔄</button>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ServerList() {
  const [data, setData] = useState(null)
  const [settings, setSettings] = useState({ baseDir: '' })
  const [globalIp, setGlobalIp] = useState('取得中...')
  const [activeTab, setActiveTab] = useState(null)
  const [clusterSubTab, setClusterSubTab] = useState('servers')
  const [selectedServer, setSelectedServer] = useState(null)
  const [selectedCluster, setSelectedCluster] = useState(null)
  const [addServerTarget, setAddServerTarget] = useState(null)
  const [showAddCluster, setShowAddCluster] = useState(false)
  const [deleteClusterConfirm, setDeleteClusterConfirm] = useState(null)
  const [deleteClusterConfirm2, setDeleteClusterConfirm2] = useState(null)
  const [deleteClusterFiles, setDeleteClusterFiles] = useState(false)
  const [requiredModsWarn, setRequiredModsWarn] = useState(null) // { server, cluster, missing, pendingStart }
  const [serverStatuses, setServerStatuses] = useState({})
  const [velocityStatuses, setVelocityStatuses] = useState({})
  const [velocityWarn, setVelocityWarn] = useState(null)
  const [dbRunning, setDbRunning] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [serverLogs, setServerLogs] = useState({})
  const [velocityLogs, setVelocityLogs] = useState({})
  const subscribedServersRef = useRef(new Set())
  const subscribedClustersRef = useRef(new Set())
  const dragSrcRef = useRef(null)

  useEffect(() => {
    window.api.loadData().then(d => {
      setData(d)
      setActiveTab(d.clusters.length > 0 ? d.clusters[0].id : 'standalone')
    })
    window.api.loadSettings().then(s => setSettings(s))
    window.api.fetchGlobalIp().then(ip => setGlobalIp(ip))
    window.api.dbStatus().then(s => setDbRunning(s.running))
    const unsubDb = window.api.onDbStatusChanged(info => setDbRunning(info.running))
    return () => unsubDb()
  }, [])

  useEffect(() => {
    if (!data) return
    const allServers = [...(data.standalone || []), ...(data.clusters || []).flatMap(c => c.servers)]
    allServers.forEach(s => {
      if (!subscribedServersRef.current.has(s.id)) {
        subscribedServersRef.current.add(s.id)
        window.api.onServerLog(s.id, msg => {
          setServerLogs(prev => ({ ...prev, [s.id]: [...(prev[s.id] || []).slice(-500), msg] }))
        })
        window.api.onServerStarted(s.id, () => setServerStatuses(prev => ({ ...prev, [s.id]: 'running' })))
        window.api.onServerStopped(s.id, () => setServerStatuses(prev => { const n = {...prev}; delete n[s.id]; return n }))
        window.api.onServerRestarting(s.id, () => setServerStatuses(prev => ({ ...prev, [s.id]: 'starting' })))
      }
    })
    ;(data.clusters || []).forEach(c => {
      if (!subscribedClustersRef.current.has(c.id)) {
        subscribedClustersRef.current.add(c.id)
        window.api.onVelocityRunLog(c.id, msg => {
          setVelocityLogs(prev => ({ ...prev, [c.id]: [...(prev[c.id] || []).slice(-500), msg] }))
        })
        window.api.onVelocityStarted(c.id, () => setVelocityStatuses(prev => ({ ...prev, [c.id]: 'running' })))
        window.api.onVelocityStopped(c.id, () => setVelocityStatuses(prev => { const n = {...prev}; delete n[c.id]; return n }))
      }
    })
  }, [data])

  // 起動時ポート検知（初回データ読み込み時のみ）
  const didPortCheckRef = useRef(false)
  useEffect(() => {
    if (!data || didPortCheckRef.current) return
    didPortCheckRef.current = true
    const allServers = [...(data.standalone || []), ...(data.clusters || []).flatMap(c => c.servers)]
    allServers.forEach(async (s) => {
      if (!s.port) return
      const inUse = await window.api.checkPort({ port: s.port })
      if (inUse) setServerStatuses(prev => ({ ...prev, [s.id]: 'running' }))
    })
    ;(data.clusters || []).forEach(async (c) => {
      const port = c.velocity?.port
      if (!port) return
      const inUse = await window.api.checkPort({ port })
      if (inUse) setVelocityStatuses(prev => ({ ...prev, [c.id]: 'running' }))
    })
  }, [data])

  const setStatus = (serverId, status) => {
    setServerStatuses(prev => {
      if (status === null) { const n = { ...prev }; delete n[serverId]; return n }
      return { ...prev, [serverId]: status }
    })
  }

  const doStartServer = async (server, isStandalone = false) => {
    if (!server.serverDir) return
    setStatus(server.id, 'starting')
    setServerLogs(prev => { const n = { ...prev }; delete n[server.id]; return n })
    const ok = await window.api.startServer({
      serverId: server.id, serverDir: server.serverDir,
      serverType: server.type || 'fabric',
      jvmMemory: server.jvmMemory || { value: 2, unit: 'G' },
      autoRestart: server.autoRestart || false,
      javaPath: server.javaPath || null,
      isStandalone,
    })
    if (!ok) setStatus(server.id, null)
  }

  const startServer = async (server) => {
    if (!server.serverDir) return
    // クラスター配下のFabricサーバーは起動前に必須Modをチェック
    const inCluster = data?.clusters?.some(c => c.servers?.some(s => s.id === server.id))
    if (inCluster && (server.type || 'fabric') === 'fabric') {
      const check = await window.api.checkRequiredMods({ serverDir: server.serverDir, isCluster: true })
      if (!check.ok) {
        const cluster = data.clusters.find(c => c.servers.some(s => s.id === server.id))
        setRequiredModsWarn({ server, cluster, missing: check.missing })
        return
      }
    }
    await doStartServer(server, !inCluster)
  }

  const stopServer = async (server) => {
    setStatus(server.id, 'stopping')
    await window.api.stopServer({ serverId: server.id })
  }

  const restartServer = async (server) => {
    await stopServer(server)
    setTimeout(() => startServer(server), 5000)
  }

  const setVelocityStatus = (clusterId, status) => {
    setVelocityStatuses(prev => {
      if (status === null) { const n = { ...prev }; delete n[clusterId]; return n }
      return { ...prev, [clusterId]: status }
    })
  }

  const getVelocityDir = (cluster) => {
    if (cluster.servers.length > 0) {
      const clusterDir = cluster.servers[0].serverDir.replace(/[\\/][^\\/]+$/, '')
      return `${clusterDir}\\velocity`
    }
    if (settings.baseDir) return `${settings.baseDir}\\${cluster.name}\\velocity`
    return null
  }

  const startVelocity = async (cluster) => {
    setVelocityStatus(cluster.id, 'starting')
    const velocityDir = getVelocityDir(cluster)
    if (!velocityDir) { setVelocityStatus(cluster.id, null); return }
    setVelocityLogs(prev => { const n = { ...prev }; delete n[cluster.id]; return n })
    const ok = await window.api.startVelocity({ clusterId: cluster.id, velocityDir })
    if (!ok) setVelocityStatus(cluster.id, null)
  }

  const stopVelocity = async (cluster) => {
    if (cluster.servers.some(s => serverStatuses[s.id])) {
      setVelocityWarn(cluster)
      return
    }
    setVelocityStatus(cluster.id, 'stopping')
    await window.api.stopVelocity({ clusterId: cluster.id })
  }

  const doStopVelocity = async (cluster) => {
    setVelocityStatus(cluster.id, 'stopping')
    await window.api.stopVelocity({ clusterId: cluster.id })
  }

  const restartVelocity = async (cluster) => {
    await doStopVelocity(cluster)
    setTimeout(() => startVelocity(cluster), 5000)
  }

  const save = (newData) => { setData(newData); window.api.saveData(newData) }

  const addServer = (server) => {
    const newData = addServerTarget === 'standalone'
      ? { ...data, standalone: [...data.standalone, server] }
      : { ...data, clusters: data.clusters.map(c => c.id === addServerTarget ? { ...c, servers: [...c.servers, server] } : c) }
    save(newData)
  }

  const deleteServer = (clusterId, serverId, deleteFiles = false) => {
    if (serverStatuses[serverId]) return
    const cluster = clusterId !== 'standalone' ? data.clusters.find(c => c.id === clusterId) : null
    const allServers = clusterId === 'standalone'
      ? data.standalone
      : (cluster?.servers || [])
    const srv = allServers.find(s => s.id === serverId)
    if (deleteFiles && srv?.serverDir) {
      window.api.deleteServerDir({ serverDir: srv.serverDir }).catch(() => {})
    }
    let newData
    if (clusterId === 'standalone') {
      newData = { ...data, standalone: data.standalone.filter(s => s.id !== serverId) }
    } else {
      newData = {
        ...data, clusters: data.clusters.map(c => {
          if (c.id !== clusterId) return c
          const newServers = c.servers.filter(s => s.id !== serverId)
          // tryServers から削除したサーバー名を除去
          const removedName = srv?.name
          const newTryServers = removedName
            ? (c.velocity?.tryServers || []).filter(n => n !== removedName)
            : (c.velocity?.tryServers || [])
          const updatedCluster = { ...c, servers: newServers, velocity: { ...c.velocity, tryServers: newTryServers } }
          // velocity.toml を再書き込み
          const velocityDir = getVelocityDir(c)
          if (velocityDir) {
            window.api.writeVelocityToml({
              velocityDir,
              servers: newServers,
              port: c.velocity?.port,
              motd: c.velocity?.motd,
              maxPlayers: c.velocity?.maxPlayers,
              forwardingMode: c.velocity?.forwardingMode,
              forwardingSecret: c.velocity?.forwardingSecret,
              tryServers: newTryServers,
            })
          }
          return updatedCluster
        })
      }
    }
    save(newData)
    if (selectedServer?.id === serverId) setSelectedServer(null)
  }

  const updateServer = (clusterId, updatedServer) => {
    const newData = clusterId === 'standalone'
      ? { ...data, standalone: data.standalone.map(s => s.id === updatedServer.id ? updatedServer : s) }
      : { ...data, clusters: data.clusters.map(c => c.id === clusterId ? { ...c, servers: c.servers.map(s => s.id === updatedServer.id ? updatedServer : s) } : c) }
    save(newData)
    setSelectedServer(updatedServer)
  }

  const reorderServers = (clusterId, fromIdx, toIdx) => {
    if (fromIdx === toIdx) return
    const newData = clusterId === 'standalone'
      ? (() => {
          const arr = [...data.standalone]
          arr.splice(toIdx, 0, arr.splice(fromIdx, 1)[0])
          return { ...data, standalone: arr }
        })()
      : { ...data, clusters: data.clusters.map(c => {
          if (c.id !== clusterId) return c
          const arr = [...c.servers]
          arr.splice(toIdx, 0, arr.splice(fromIdx, 1)[0])
          return { ...c, servers: arr }
        }) }
    save(newData)
  }

  const updatePort = (clusterId, serverId, port) => {
    const newData = clusterId === 'standalone'
      ? { ...data, standalone: data.standalone.map(s => s.id === serverId ? { ...s, port } : s) }
      : { ...data, clusters: data.clusters.map(c => c.id === clusterId ? { ...c, servers: c.servers.map(s => s.id === serverId ? { ...s, port } : s) } : c) }
    save(newData)
    const server = [...data.clusters.flatMap(c => c.servers), ...data.standalone].find(s => s.id === serverId)
    if (server?.serverDir) {
      window.api.readServerProperties({ serverDir: server.serverDir }).then(props => {
        if (props) window.api.writeServerProperties({ serverDir: server.serverDir, properties: { ...props, 'server-port': String(port) } })
      })
    }
  }

  // tryServers（メインサーバー）トグル
  const toggleTryServer = (cluster, serverName) => {
    const current = cluster.velocity?.tryServers || []
    const next = current.includes(serverName)
      ? current.filter(n => n !== serverName)
      : [...current, serverName]
    const updatedVelocity = { ...cluster.velocity, tryServers: next }
    const updatedCluster = { ...cluster, velocity: updatedVelocity }
    const newData = { ...data, clusters: data.clusters.map(c => c.id === cluster.id ? updatedCluster : c) }
    save(newData)
    // velocity.toml を再書き込み
    const velocityDir = getVelocityDir(cluster)
    if (velocityDir) {
      window.api.writeVelocityToml({
        velocityDir,
        servers: cluster.servers,
        port: updatedVelocity.port,
        motd: updatedVelocity.motd,
        maxPlayers: updatedVelocity.maxPlayers,
        forwardingMode: updatedVelocity.forwardingMode,
        forwardingSecret: updatedVelocity.forwardingSecret,
        tryServers: next,
      })
    }
  }

  const updateCluster = (updatedCluster) => {
    const newData = { ...data, clusters: data.clusters.map(c => c.id === updatedCluster.id ? updatedCluster : c) }
    save(newData)
    setSelectedCluster(updatedCluster)
    updatedCluster.servers
      .filter(s => !s.individualProperties && s.serverDir)
      .forEach(s => {
        window.api.writeServerProperties({
          serverDir: s.serverDir,
          properties: { ...updatedCluster.defaultProperties, 'server-port': String(s.port) }
        })
      })
  }

  const deleteCluster = (clusterId, deleteFiles = false) => {
    const cluster = data.clusters.find(c => c.id === clusterId)
    if (cluster?.servers.some(s => serverStatuses[s.id])) return
    if (deleteFiles && settings.baseDir && cluster?.name) {
      const clusterDir = `${settings.baseDir}\\${cluster.name}`
      window.api.deleteClusterDir({ clusterDir }).catch(() => {})
    }
    const newClusters = data.clusters.filter(c => c.id !== clusterId)
    if (activeTab === clusterId) setActiveTab(newClusters.length > 0 ? newClusters[0].id : 'standalone')
    save({ ...data, clusters: newClusters })
    setSelectedServer(null)
  }

  const addCluster = (cluster) => {
    save({ ...data, clusters: [...data.clusters, cluster] })
    setActiveTab(cluster.id)
  }

  const rescanCluster = async (cluster) => {
    // クラスタディレクトリを既存サーバーのparentから導出、なければbaseDir+nameで試みる
    let clusterDir
    if (cluster.servers.length > 0) {
      clusterDir = cluster.servers[0].serverDir.replace(/[\\/][^\\/]+$/, '')
    } else if (settings.baseDir) {
      clusterDir = `${settings.baseDir}\\${cluster.name}`
    } else {
      return
    }
    const result = await window.api.scanClusterDir({ clusterDir })
    if (!result.success) return
    // 既存の順番を保持しながらマージ（ディスクに存在しなくなったサーバーは除去）
    const existingMerged = cluster.servers
      .map(e => {
        const scanned = result.servers.find(s => s.serverDir === e.serverDir)
        if (!scanned) return null
        return { ...e, type: scanned.type || e.type, port: scanned.port || e.port, mcVersion: scanned.mcVersion || e.mcVersion || '' }
      })
      .filter(Boolean)
    // 新たに発見されたサーバーを末尾に追加
    const newServers = result.servers
      .filter(s => !cluster.servers.find(e => e.serverDir === s.serverDir))
      .map((s, i) => ({
        id: `server-${Date.now()}-${i}`,
        name: s.name, port: s.port, serverDir: s.serverDir,
        type: s.type || 'fabric', mcVersion: s.mcVersion || '',
        enabledMods: [], enabledPlugins: [],
        jvmMemory: { value: 2, unit: 'G' }, individualProperties: null,
      }))
    const merged = [...existingMerged, ...newServers]
    const updatedCluster = { ...cluster, servers: merged }
    save({ ...data, clusters: data.clusters.map(c => c.id === cluster.id ? updatedCluster : c) })
  }

  const syncLevelName = (serverDir, serverName, levelName) => {
    // level-name が "world"（デフォルト）の場合はサーバー名を level-name に書き込む
    if (levelName === 'world' || !levelName) {
      window.api.writeServerProperties({ serverDir, properties: { 'level-name': serverName } }).catch(() => {})
    }
  }

  const importCluster = (scanResult) => {
    const velocityConfig = scanResult.velocityConfig || {
      port: 25577,
      forwardingMode: 'modern',
      forwardingSecret: generateSecret(),
      motd: 'A Velocity Proxy',
      maxPlayers: 500,
    }
    const cluster = {
      id: `cluster-${Date.now()}`,
      name: scanResult.clusterName,
      servers: scanResult.servers.map((s, i) => ({
        id: `server-${Date.now()}-${i}`,
        name: s.name,
        port: s.port,
        serverDir: s.serverDir,
        type: s.type || 'fabric',
        mcVersion: s.mcVersion || '',
        enabledMods: [],
        enabledPlugins: [],
        jvmMemory: { value: 2, unit: 'G' },
        individualProperties: null,
      })),
      defaultProperties: { ...DEFAULT_CLUSTER_PROPERTIES },
      velocity: velocityConfig,
    }
    // level-name とサーバー名を同期
    for (const s of scanResult.servers) {
      if (s.serverDir) syncLevelName(s.serverDir, s.name, s.levelName)
    }
    save({ ...data, clusters: [...data.clusters, cluster] })
    setActiveTab(cluster.id)
  }

  const importStandalone = (scanResult) => {
    const server = {
      id: `server-${Date.now()}`,
      name: scanResult.name,
      port: scanResult.port,
      serverDir: scanResult.serverDir,
      type: scanResult.type || 'fabric',
      enabledMods: [],
      enabledPlugins: [],
      jvmMemory: { value: 2, unit: 'G' },
      individualProperties: null,
    }
    // level-name とサーバー名を同期
    if (scanResult.serverDir) syncLevelName(scanResult.serverDir, scanResult.name, scanResult.levelName)
    save({ ...data, standalone: [...data.standalone, server] })
    setActiveTab('standalone')
  }

  // ポート競合検知: port -> [{name, source}]
  const portConflictMap = useMemo(() => {
    if (!data) return {}
    const map = {}
    const add = (port, name, source) => {
      if (!port) return
      if (!map[port]) map[port] = []
      map[port].push({ name, source })
    }
    data.standalone.forEach(s => add(s.port, s.name, 'スタンドアロン'))
    data.clusters.forEach(c => {
      c.servers.forEach(s => add(s.port, s.name, c.name))
      if (c.velocity?.port) add(c.velocity.port, `${c.name} (Velocity)`, c.name)
    })
    return Object.fromEntries(Object.entries(map).filter(([, v]) => v.length > 1))
  }, [data])

  if (!data) return <div style={{ color: 'var(--text-muted)', padding: 24 }}>読み込み中...</div>

  const activeCluster = data.clusters.find(c => c.id === activeTab)
  const isStandalone = activeTab === 'standalone'
  const clusterHasRunning = activeCluster?.servers.some(s => serverStatuses[s.id])

  if (selectedServer) {
    return (
      <ServerDetail
        key={selectedServer.id}
        server={selectedServer}
        cluster={selectedCluster}
        onBack={() => setSelectedServer(null)}
        onUpdateServer={(s) => updateServer(selectedCluster?.id || 'standalone', s)}
        onUpdateCluster={updateCluster}
        serverStatus={serverStatuses[selectedServer.id] || null}
        onStart={() => startServer(selectedServer)}
        onStop={() => stopServer(selectedServer)}
        logs={serverLogs[selectedServer.id] || []}
        conflictInfo={portConflictMap[selectedServer.port] || null}
      />
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div className="page-title" style={{ marginBottom: 0 }}>サーバー管理</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', cursor: 'pointer' }} onClick={() => navigator.clipboard.writeText(globalIp)} title="クリックでコピー">
            🌐 Global IP: <span style={{ color: 'var(--text-accent-2)', fontWeight: 600 }}>{globalIp}</span> 📋
          </div>
          <button className="btn btn-restart" onClick={() => setShowImport(true)}>インポート</button>
          <button className="btn btn-start" onClick={() => setShowAddCluster(true)}>＋ クラスター追加</button>
        </div>
      </div>

      <div className="tab-bar">
        {data.clusters.map(c => (
          <button key={c.id} className={`tab-btn ${activeTab === c.id ? 'active' : ''}`} onClick={() => { setActiveTab(c.id); setClusterSubTab('servers') }}>
            🖧 {c.name}
          </button>
        ))}
        <button className={`tab-btn ${activeTab === 'standalone' ? 'active' : ''}`} onClick={() => setActiveTab('standalone')}>
          🖥 スタンドアロン
        </button>
      </div>

      <div className="tab-content">
        {!isStandalone && activeCluster && (
          <>
            <div className="cluster-header-area">
              {/* Row 1: cluster control buttons */}
              <div className="cluster-actions-row">
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {clusterSubTab === 'servers' && (
                    <>
                      <button className="btn btn-restart" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => rescanCluster(activeCluster)}>再スキャン</button>
                      <button className="btn btn-restart" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => setAddServerTarget(activeCluster.id)}>＋ サーバー追加</button>
                    </>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {(() => {
                    const vs = velocityStatuses[activeCluster.id] || null
                    return (
                      <>
                        <div className={`status-dot ${statusDotClass(vs)}`} title="Velocity" />
                        {!vs && <button className="btn btn-start" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => startVelocity(activeCluster)}>クラスター起動</button>}
                        {vs === 'starting' && <button className="btn" style={{ fontSize: 12, padding: '5px 12px', background: 'linear-gradient(135deg,#f59e0b,#d97706)', color: '#000' }} disabled>起動中...</button>}
                        {vs === 'running' && <button className="btn btn-stop" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => stopVelocity(activeCluster)}>クラスター停止</button>}
                        {vs === 'running' && <button className="btn btn-restart" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => restartVelocity(activeCluster)}>再起動</button>}
                        {vs === 'stopping' && <button className="btn" style={{ fontSize: 12, padding: '5px 12px', background: 'var(--border)', color: 'var(--text-2)' }} disabled>停止中...</button>}
                      </>
                    )
                  })()}
                  <button
                    className="btn btn-stop"
                    style={{ fontSize: 12, padding: '5px 12px', opacity: clusterHasRunning ? 0.4 : 1, cursor: clusterHasRunning ? 'not-allowed' : 'pointer' }}
                    onClick={() => !clusterHasRunning && setDeleteClusterConfirm(activeCluster)}
                    title={clusterHasRunning ? '起動中のサーバーがあります' : ''}
                  >クラスター削除</button>
                </div>
              </div>
              {/* Row 2: tab bar */}
              <div className="tab-bar" style={{ marginBottom: 0 }}>
                <button className={`tab-btn ${clusterSubTab === 'servers' ? 'active' : ''}`} onClick={() => setClusterSubTab('servers')}>サーバー</button>
                <button className={`tab-btn ${clusterSubTab === 'settings' ? 'active' : ''}`} onClick={() => setClusterSubTab('settings')}>基本設定</button>
                <button className={`tab-btn ${clusterSubTab === 'velocity' ? 'active' : ''}`} onClick={() => setClusterSubTab('velocity')}>Velocity</button>
                <button className={`tab-btn ${clusterSubTab === 'console' ? 'active' : ''}`} onClick={() => setClusterSubTab('console')}>コンソール</button>
                <button className={`tab-btn ${clusterSubTab === 'mods' ? 'active' : ''}`} onClick={() => setClusterSubTab('mods')}>Mod</button>
                <button className={`tab-btn ${clusterSubTab === 'plugins' ? 'active' : ''}`} onClick={() => setClusterSubTab('plugins')}>Plugins</button>
                <button className={`tab-btn ${clusterSubTab === 'players' ? 'active' : ''}`} onClick={() => setClusterSubTab('players')}>プレイヤー</button>
                <button className={`tab-btn ${clusterSubTab === 'db' ? 'active' : ''}`} onClick={() => setClusterSubTab('db')}>
                  🗄 DB
                  <span style={{ marginLeft: 4, width: 7, height: 7, borderRadius: '50%', background: dbRunning ? '#22c55e' : '#ef4444', display: 'inline-block', verticalAlign: 'middle' }} />
                </button>
                <button className={`tab-btn ${clusterSubTab === 'performance' ? 'active' : ''}`} onClick={() => setClusterSubTab('performance')}>📊 パフォーマンス</button>
              </div>
            </div>

            {clusterSubTab === 'servers' && (
              <div className="server-grid" style={{ marginTop: 12 }}>
                {activeCluster.servers.map((s, idx) => (
                  <div key={s.id} draggable
                    onDragStart={() => { dragSrcRef.current = idx }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => reorderServers(activeCluster.id, dragSrcRef.current, idx)}
                  >
                    <ServerCard server={s}
                      onClick={() => { setSelectedServer(s); setSelectedCluster(activeCluster) }}
                      onDelete={(deleteFiles) => deleteServer(activeCluster.id, s.id, deleteFiles)}
                      onUpdatePort={(port) => updatePort(activeCluster.id, s.id, port)}
                      serverStatus={serverStatuses[s.id] || null}
                      onStart={() => startServer(s)} onStop={() => stopServer(s)} onRestart={() => restartServer(s)}
                      conflictInfo={portConflictMap[s.port] || null}
                      isTry={(activeCluster.velocity?.tryServers || []).includes(s.name)}
                      onToggleTry={() => toggleTryServer(activeCluster, s.name)}
                    />
                  </div>
                ))}
                {activeCluster.servers.length === 0 && <div style={{ color: 'var(--text-dim)', fontSize: 14 }}>サーバーがありません</div>}
              </div>
            )}
            {clusterSubTab === 'settings' && (
              <div style={{ marginTop: 12 }}>
                <ClusterSettings cluster={activeCluster} onUpdate={updateCluster} />
              </div>
            )}
            {clusterSubTab === 'velocity' && (
              <div style={{ marginTop: 12 }}>
                <VelocitySettings cluster={activeCluster} onUpdate={updateCluster} baseDir={settings.baseDir} />
              </div>
            )}
            {clusterSubTab === 'console' && (
              <ClusterConsole
                cluster={activeCluster}
                serverLogs={serverLogs}
                velocityLogs={velocityLogs}
                serverStatuses={serverStatuses}
              />
            )}
            {clusterSubTab === 'mods' && (
              <div style={{ marginTop: 12 }}>
                <ClusterModTab cluster={activeCluster} onUpdate={updateCluster} />
              </div>
            )}
            {clusterSubTab === 'plugins' && (
              <VelocityPluginTab cluster={activeCluster} settings={settings} onUpdateCluster={updateCluster} />
            )}
            {clusterSubTab === 'players' && (
              <PlayerTab
                cluster={activeCluster}
                velocityLogs={velocityLogs[activeCluster.id] || []}
                serverLogs={serverLogs}
                serverStatuses={serverStatuses}
                onSendCommand={(serverId, cmd) => window.api.sendCommand({ serverId, command: cmd })}
              />
            )}
            {clusterSubTab === 'db' && (
              <ClusterDbTab cluster={activeCluster} dbRunning={dbRunning} />
            )}
            {clusterSubTab === 'performance' && (
              <PerformanceTab servers={activeCluster.servers} serverStatuses={serverStatuses} />
            )}
          </>
        )}

        {isStandalone && (
          <>
            <div className="cluster-header">
              <div className="cluster-title" />
              <button className="btn btn-restart" onClick={() => setAddServerTarget('standalone')}>＋ サーバー追加</button>
            </div>
            <div className="server-grid">
              {data.standalone.map((s, idx) => (
                <div key={s.id} draggable
                  onDragStart={() => { dragSrcRef.current = idx }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => reorderServers('standalone', dragSrcRef.current, idx)}
                >
                  <ServerCard server={s}
                    onClick={() => { setSelectedServer(s); setSelectedCluster(null) }}
                    onDelete={(deleteFiles) => deleteServer('standalone', s.id, deleteFiles)}
                    onUpdatePort={(port) => updatePort('standalone', s.id, port)}
                    serverStatus={serverStatuses[s.id] || null}
                    onStart={() => startServer(s)} onStop={() => stopServer(s)} onRestart={() => restartServer(s)}
                    conflictInfo={portConflictMap[s.port] || null}
                  />
                </div>
              ))}
              {data.standalone.length === 0 && <div style={{ color: 'var(--text-dim)', fontSize: 14 }}>サーバーがありません</div>}
            </div>
          </>
        )}
      </div>

      {deleteClusterConfirm && (
        <ConfirmModal
          message={`「${deleteClusterConfirm.name}」を削除しますか？\n中のサーバーも全て削除されます。`}
          onConfirm={() => { setDeleteClusterConfirm2(deleteClusterConfirm); setDeleteClusterConfirm(null) }}
          onClose={() => { setDeleteClusterConfirm(null); setDeleteClusterFiles(false) }}
          checkboxLabel="実ファイルも削除する（元に戻せません）"
          checkboxChecked={deleteClusterFiles}
          onCheckboxChange={setDeleteClusterFiles}
        />
      )}
      {deleteClusterConfirm2 && (
        <ConfirmModal
          message={`本当に削除しますか？この操作は取り消せません。${deleteClusterFiles ? '\n\n⚠ 実ファイルも完全に削除されます。' : ''}`}
          onConfirm={() => { deleteCluster(deleteClusterConfirm2.id, deleteClusterFiles); setDeleteClusterConfirm2(null); setDeleteClusterFiles(false) }}
          onClose={() => { setDeleteClusterConfirm2(null); setDeleteClusterFiles(false) }}
        />
      )}
      {velocityWarn && (
        <ConfirmModal
          message={`「${velocityWarn.name}」クラスターに起動中のサーバーがあります。このままクラスターを停止しますか？`}
          confirmLabel="停止する"
          confirmClass="btn-stop"
          onConfirm={() => { doStopVelocity(velocityWarn); setVelocityWarn(null) }}
          onClose={() => setVelocityWarn(null)}
        />
      )}
      {addServerTarget && (
        <AddServerModal onAdd={addServer} onClose={() => setAddServerTarget(null)} baseDir={settings.baseDir} cluster={addServerTarget === 'standalone' ? null : activeCluster} />
      )}
      {showAddCluster && (
        <AddClusterModal onAdd={addCluster} onClose={() => setShowAddCluster(false)} baseDir={settings.baseDir} />
      )}
      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onImportCluster={importCluster}
          onImportStandalone={importStandalone}
        />
      )}

      {/* 必須Mod不足の警告ダイアログ */}
      {requiredModsWarn && (
        <RequiredModsWarnModal
          server={requiredModsWarn.server}
          cluster={requiredModsWarn.cluster}
          missing={requiredModsWarn.missing}
          onRepairAndStart={async () => {
            const { server, cluster } = requiredModsWarn
            setRequiredModsWarn(null)
            await window.api.repairRequiredMods({
              serverDir: server.serverDir,
              mcVersion: server.mcVersion,
              forwardingSecret: cluster?.velocity?.forwardingSecret || '',
              missingMods: requiredModsWarn.missing,
            })
            await doStartServer(server)
          }}
          onStartAnyway={() => { const s = requiredModsWarn.server; setRequiredModsWarn(null); doStartServer(s) }}
          onClose={() => setRequiredModsWarn(null)}
        />
      )}
    </div>
  )
}

export default ServerList