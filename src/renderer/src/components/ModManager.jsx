import { useState, useEffect, useRef } from 'react'

// ─── Modrinth 検索モーダル ────────────────────────────────────────────────────

function ModrinthModal({ modSources, onClose, onDownloaded }) {
  const [view, setView] = useState('search') // 'search' | 'versions'
  const [query, setQuery] = useState('')
  const [loader, setLoader] = useState('fabric')
  const [mcVersion, setMcVersion] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')

  const [selectedMod, setSelectedMod] = useState(null)
  const [versions, setVersions] = useState([])
  const [loadingVersions, setLoadingVersions] = useState(false)

  const [downloading, setDownloading] = useState(null) // versionId
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [downloadDone, setDownloadDone] = useState(null) // filename
  const [destSourceId, setDestSourceId] = useState(modSources[0]?.id || '')

  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
    window.api.onModrinthDownloadProgress(({ percent }) => setDownloadProgress(percent))
  }, [])

  useEffect(() => {
    setDestSourceId(modSources[0]?.id || '')
  }, [modSources])

  const handleSearch = async () => {
    if (!query.trim()) return
    setSearching(true)
    setSearchError('')
    setResults([])
    const hits = await window.api.modrinthSearch({ query: query.trim(), loader, mcVersion: mcVersion.trim() || null })
    setSearching(false)
    if (hits.length === 0) setSearchError('Modが見つかりませんでした')
    setResults(hits)
  }

  const handleSelectMod = async (mod) => {
    setSelectedMod(mod)
    setView('versions')
    setVersions([])
    setDownloadDone(null)
    setLoadingVersions(true)
    const vers = await window.api.modrinthVersions({
      projectId: mod.project_id,
      loader,
      mcVersion: mcVersion.trim() || null,
    })
    setVersions(vers)
    setLoadingVersions(false)
  }

  const handleDownload = async (ver) => {
    const file = ver.files.find(f => f.primary) || ver.files[0]
    if (!file) return
    const destSource = modSources.find(s => s.id === destSourceId)
    if (!destSource) return
    setDownloading(ver.id)
    setDownloadProgress(0)
    setDownloadDone(null)
    const result = await window.api.modrinthDownload({
      url: file.url,
      filename: file.filename,
      destDir: destSource.dir,
    })
    setDownloading(null)
    if (result.success) {
      setDownloadDone(file.filename)
      onDownloaded()
    }
  }

  const formatDownloads = (n) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
    if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
    return String(n)
  }

  const LOADERS = ['fabric', 'forge', 'neoforge', 'quilt']

  return (
    <div className="modal-overlay" style={{ alignItems: 'flex-start', paddingTop: 40 }}>
      <div className="modal" style={{ width: 680, maxWidth: '95vw', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>

        {/* ヘッダー */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          {view === 'versions' && (
            <button
              onClick={() => { setView('search'); setDownloadDone(null) }}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 4px' }}
            >←</button>
          )}
          <div className="modal-title" style={{ marginBottom: 0, flex: 1 }}>
            {view === 'search' ? '🔍 Modrinthから検索' : selectedMod?.title}
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 18, padding: '0 4px' }}
          >✕</button>
        </div>

        {/* 検索バー (検索ビューのみ) */}
        {view === 'search' && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input
                ref={inputRef}
                className="modal-input"
                style={{ flex: 1 }}
                placeholder="Mod名で検索..."
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
              />
              <button className="btn btn-start" onClick={handleSearch} disabled={searching || !query.trim()}>
                {searching ? '検索中...' : '検索'}
              </button>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>ローダー:</span>
              {LOADERS.map(l => (
                <button key={l} className={`tab-btn ${loader === l ? 'active' : ''}`}
                  style={{ fontSize: 11, padding: '3px 10px' }}
                  onClick={() => setLoader(l)}>{l}</button>
              ))}
              <div style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 4px' }} />
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>MCバージョン:</span>
              <input
                className="modal-input"
                style={{ width: 90, padding: '4px 8px', fontSize: 12 }}
                placeholder="例: 1.21.1"
                value={mcVersion}
                onChange={e => setMcVersion(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
              />
            </div>
          </div>
        )}

        {/* ダウンロード先 (バージョンビューのみ・複数フォルダある時) */}
        {view === 'versions' && modSources.length > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, padding: '8px 12px', background: 'var(--bg-section)', borderRadius: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>保存先:</span>
            <select className="modal-input" style={{ flex: 1, fontSize: 12 }}
              value={destSourceId} onChange={e => setDestSourceId(e.target.value)}>
              {modSources.map(s => (
                <option key={s.id} value={s.id}>{s.loader} {s.version} — {s.dir}</option>
              ))}
            </select>
          </div>
        )}
        {view === 'versions' && modSources.length === 1 && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
            保存先: <span style={{ color: 'var(--text)' }}>{modSources[0].dir}</span>
          </div>
        )}
        {view === 'versions' && modSources.length === 0 && (
          <div style={{ fontSize: 12, color: '#ef4444', marginBottom: 10 }}>
            ⚠ ライブラリフォルダが登録されていません。先にModフォルダを登録してください。
          </div>
        )}

        {/* コンテンツ */}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>

          {/* 検索結果 */}
          {view === 'search' && (
            <div>
              {searchError && (
                <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '16px 0', textAlign: 'center' }}>{searchError}</div>
              )}
              {!searching && results.length === 0 && !searchError && (
                <div style={{ color: 'var(--text-dim)', fontSize: 13, padding: '24px 0', textAlign: 'center' }}>
                  キーワードを入力してEnterまたは「検索」を押してください
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {results.map(mod => (
                  <button
                    key={mod.project_id}
                    onClick={() => handleSelectMod(mod)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '10px 12px', borderRadius: 8, textAlign: 'left',
                      background: 'var(--bg-card)', border: '1px solid var(--border)',
                      cursor: 'pointer', width: '100%', transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-card)'}
                  >
                    {mod.icon_url ? (
                      <img src={mod.icon_url} alt="" style={{ width: 40, height: 40, borderRadius: 8, flexShrink: 0, objectFit: 'cover' }} />
                    ) : (
                      <div style={{ width: 40, height: 40, borderRadius: 8, background: 'var(--bg-section)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>📦</div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', marginBottom: 2 }}>{mod.title}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mod.description}</div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                        {mod.categories?.slice(0, 4).map(c => (
                          <span key={c} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 99, background: 'var(--bg-tag-blue)', color: 'var(--text-accent-2)' }}>{c}</span>
                        ))}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>⬇ {formatDownloads(mod.downloads)}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* バージョン一覧 */}
          {view === 'versions' && (
            <div>
              {selectedMod && (
                <div style={{ display: 'flex', gap: 10, marginBottom: 14, padding: '10px 12px', background: 'var(--bg-section)', borderRadius: 8 }}>
                  {selectedMod.icon_url && (
                    <img src={selectedMod.icon_url} alt="" style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
                  )}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedMod.description}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>⬇ {formatDownloads(selectedMod.downloads)} DL</div>
                  </div>
                </div>
              )}

              {loadingVersions && (
                <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '16px 0', textAlign: 'center' }}>バージョンを読み込み中...</div>
              )}
              {!loadingVersions && versions.length === 0 && (
                <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '16px 0', textAlign: 'center' }}>
                  該当するバージョンが見つかりませんでした
                </div>
              )}

              {downloadDone && (
                <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', fontSize: 12, color: '#166534', marginBottom: 10 }}>
                  ✅ {downloadDone} をダウンロードしました
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {versions.map(ver => {
                  const isDl = downloading === ver.id
                  const file = ver.files.find(f => f.primary) || ver.files[0]
                  return (
                    <div key={ver.id} style={{
                      padding: '10px 12px', borderRadius: 8,
                      background: 'var(--bg-card)', border: '1px solid var(--border)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', marginBottom: 3 }}>{ver.name}</div>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {ver.loaders?.map(l => (
                              <span key={l} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 99, background: 'var(--bg-tag-blue)', color: 'var(--text-accent-2)' }}>{l}</span>
                            ))}
                            {ver.game_versions?.slice(0, 5).map(v => (
                              <span key={v} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 99, background: 'rgba(74,222,128,0.1)', color: '#16a34a' }}>{v}</span>
                            ))}
                            {ver.game_versions?.length > 5 && (
                              <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>+{ver.game_versions.length - 5}</span>
                            )}
                          </div>
                          {file && (
                            <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.filename}</div>
                          )}
                        </div>
                        <button
                          className="btn btn-start"
                          style={{ fontSize: 12, padding: '5px 14px', flexShrink: 0, minWidth: 80 }}
                          onClick={() => handleDownload(ver)}
                          disabled={!!downloading || modSources.length === 0}
                        >
                          {isDl ? `${downloadProgress}%` : '⬇ DL'}
                        </button>
                      </div>
                      {isDl && (
                        <div style={{ marginTop: 8, height: 4, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
                          <div style={{
                            width: `${downloadProgress}%`, height: '100%',
                            background: 'linear-gradient(90deg, var(--text-accent), var(--text-accent-2))',
                            borderRadius: 99, transition: 'width 0.3s',
                          }} />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── 既存コンポーネント ───────────────────────────────────────────────────────

function RegisterModFolderModal({ onRegister, onClose }) {
  const [loader, setLoader] = useState('fabric')
  const [version, setVersion] = useState('')
  const [dir, setDir] = useState('')

  const handleSelectFolder = async () => {
    const path = await window.api.selectFolder()
    if (path) setDir(path)
  }

  const handleRegister = async () => {
    if (!loader || !version || !dir) return
    await window.api.addModSource({ loader, version, dir })
    onRegister()
    onClose()
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-title">Modフォルダを登録</div>
        <div style={{ marginBottom: 12 }}>
          <div style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 6 }}>ローダー</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {['fabric', 'forge', 'neoforge'].map(l => (
              <button key={l} className={`tab-btn ${loader === l ? 'active' : ''}`}
                style={{ fontSize: 12, padding: '4px 10px' }}
                onClick={() => setLoader(l)}>{l}</button>
            ))}
          </div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <div style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 6 }}>MCバージョン</div>
          <input className="modal-input" placeholder="例: 1.21.1" value={version}
            onChange={e => setVersion(e.target.value)} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 6 }}>Modフォルダ</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input className="modal-input" style={{ flex: 1 }} value={dir} readOnly
              placeholder="フォルダを選択..." onChange={() => {}} />
            <button className="btn btn-restart" onClick={handleSelectFolder}>選択</button>
          </div>
        </div>
        <div className="modal-buttons">
          <button className="btn btn-stop" onClick={onClose}>キャンセル</button>
          <button className="btn btn-start" onClick={handleRegister}
            disabled={!loader || !version || !dir}>登録</button>
        </div>
      </div>
    </div>
  )
}

function RegisterFolderModal({ title, onRegister, onClose }) {
  const [dir, setDir] = useState('')

  const handleSelectFolder = async () => {
    const path = await window.api.selectFolder()
    if (path) setDir(path)
  }

  const handleRegister = async () => {
    if (!dir) return
    await onRegister(dir)
    onClose()
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-title">{title}</div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 6 }}>フォルダ</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input className="modal-input" style={{ flex: 1 }} value={dir} readOnly
              placeholder="フォルダを選択..." onChange={() => {}} />
            <button className="btn btn-restart" onClick={handleSelectFolder}>選択</button>
          </div>
        </div>
        <div className="modal-buttons">
          <button className="btn btn-stop" onClick={onClose}>キャンセル</button>
          <button className="btn btn-start" onClick={handleRegister} disabled={!dir}>登録</button>
        </div>
      </div>
    </div>
  )
}

function ItemRow({ filename, displayName, description, onNameChange }) {
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const [expanded, setExpanded] = useState(false)

  const startEdit = () => {
    setEditValue(displayName || filename)
    setEditing(true)
  }

  const handleSave = () => {
    setEditing(false)
    const v = editValue.trim()
    onNameChange?.(filename, v || filename)
  }

  const hasCustomName = displayName && displayName !== filename

  return (
    <div style={{ background: 'var(--bg-deep)', borderRadius: 4, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px' }}>
        {editing ? (
          <>
            <input
              className="modal-input"
              style={{ flex: 1, fontSize: 12, padding: '2px 6px' }}
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditing(false) }}
              autoFocus
            />
            <button onClick={handleSave} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4ade80', fontSize: 14, padding: '0 2px' }}>✓</button>
            <button onClick={() => setEditing(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', fontSize: 14, padding: '0 2px' }}>✕</button>
          </>
        ) : (
          <>
            {description && (
              <button
                onClick={() => setExpanded(e => !e)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', fontSize: 9, padding: '0 2px', flexShrink: 0 }}
                title="概要を表示"
              >{expanded ? '▼' : '▶'}</button>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              {hasCustomName ? (
                <>
                  <div style={{ fontSize: 12, color: 'var(--text)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{filename}</div>
                </>
              ) : (
                <div style={{ fontSize: 12, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{filename}</div>
              )}
            </div>
            {onNameChange && (
              <button
                onClick={startEdit}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', fontSize: 11, padding: '0 2px', flexShrink: 0 }}
                title="名前を編集"
              >✏</button>
            )}
          </>
        )}
      </div>
      {expanded && description && (
        <div style={{ padding: '6px 10px 8px 22px', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          {description}
        </div>
      )}
    </div>
  )
}

function PluginSourceCard({ source, categoryLabel, onAdd, onRemoveSource, modNames, modDescriptions, onNameChange }) {
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ color: 'var(--text-dim)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          {source.dir}
        </span>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0, marginLeft: 8 }}>
          <button className="btn btn-restart" style={{ fontSize: 11, padding: '2px 8px' }}
            onClick={() => window.api.openFolder(source.dir)} title="フォルダを開く">📁</button>
          <button className="btn btn-restart" style={{ fontSize: 11, padding: '2px 8px' }}
            onClick={onAdd}>＋ 追加</button>
          <button className="btn btn-stop" style={{ fontSize: 11, padding: '2px 8px' }}
            onClick={onRemoveSource}>登録解除</button>
        </div>
      </div>
      {source.files.length === 0 ? (
        <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>
          このフォルダに{categoryLabel}がありません。フォルダにJARファイルを追加すると自動で表示されます。
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {source.files.map(filename => (
            <ItemRow
              key={filename}
              filename={filename}
              displayName={modNames?.[filename]}
              description={modDescriptions?.[filename]}
              onNameChange={onNameChange}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── メインコンポーネント ─────────────────────────────────────────────────────

function ModManager() {
  const [tab, setTab] = useState('mods')
  const [structure, setStructure] = useState({ mods: [], paperSources: [], velocitySources: [] })
  const [loading, setLoading] = useState(false)
  const [showRegisterMod, setShowRegisterMod] = useState(false)
  const [showRegisterPaper, setShowRegisterPaper] = useState(false)
  const [showRegisterVelocity, setShowRegisterVelocity] = useState(false)
  const [showModrinth, setShowModrinth] = useState(false)
  const [modNames, setModNames] = useState({}) // { filename: displayName }
  const [modDescriptions, setModDescriptions] = useState({}) // { filename: description }
  const [resolving, setResolving] = useState(null) // source.id being resolved

  const loadStructure = async () => {
    setLoading(true)
    const result = await window.api.getLibraryStructure()
    setStructure(result)
    setLoading(false)
  }

  const saveModNames = (names) => {
    window.api.loadSettings().then(s => {
      window.api.saveSettings({ ...s, modNames: names })
    })
  }

  const handleNameChange = (filename, newName) => {
    setModNames(prev => {
      const next = { ...prev, [filename]: newName }
      saveModNames(next)
      return next
    })
  }

  const handleResolveNames = async (source) => {
    setResolving(source.id)
    const result = await window.api.modrinthResolveFiles({ dir: source.dir, filenames: source.files })
    setModNames(prev => {
      const next = { ...prev }
      for (const [filename, info] of Object.entries(result)) {
        if (!next[filename]) next[filename] = info.title
      }
      saveModNames(next)
      return next
    })
    setModDescriptions(prev => {
      const next = { ...prev }
      for (const [filename, info] of Object.entries(result)) {
        if (info.description) next[filename] = info.description
      }
      window.api.loadSettings().then(s => window.api.saveSettings({ ...s, modDescriptions: next }))
      return next
    })
    setResolving(null)
  }

  useEffect(() => {
    const init = async () => {
      const s = await window.api.loadSettings()
      const names = s.modNames || {}
      const descs = s.modDescriptions || {}
      setModNames(names)
      setModDescriptions(descs)

      setLoading(true)
      const result = await window.api.getLibraryStructure()
      setStructure(result)
      setLoading(false)

      // Auto-resolve unresolved mods
      const allSources = [...(result.mods || []), ...(result.paperSources || []), ...(result.velocitySources || [])]
      let updatedNames = { ...names }
      let updatedDescs = { ...descs }
      let changed = false
      for (const source of allSources) {
        const unresolved = (source.files || []).filter(f => !updatedNames[f] || !updatedDescs[f])
        if (unresolved.length === 0) continue
        setResolving(source.id)
        const resolveResult = await window.api.modrinthResolveFiles({ dir: source.dir, filenames: unresolved })
        for (const [filename, info] of Object.entries(resolveResult)) {
          if (!updatedNames[filename] && info.title) { updatedNames[filename] = info.title; changed = true }
          if (info.description) { updatedDescs[filename] = info.description; changed = true }
        }
      }
      setResolving(null)
      if (changed) {
        setModNames({ ...updatedNames })
        setModDescriptions({ ...updatedDescs })
        const finalS = await window.api.loadSettings()
        window.api.saveSettings({ ...finalS, modNames: updatedNames, modDescriptions: updatedDescs })
      }
    }
    init()
    window.api.onLibraryChanged(() => loadStructure())
    return () => window.api.removeAllListeners('library-changed')
  }, [])

  useEffect(() => {
    window.api.watchLibrary()
    return () => window.api.unwatchLibrary()
  }, [])

  const handleRegisterMod = async () => {
    await window.api.watchLibrary()
    loadStructure()
  }

  const handleRegisterPaper = async (dir) => {
    await window.api.addPaperPluginSource({ dir })
    await window.api.watchLibrary()
    loadStructure()
  }

  const handleRegisterVelocity = async (dir) => {
    await window.api.addVelocityPluginSource({ dir })
    await window.api.watchLibrary()
    loadStructure()
  }

  const handleRemoveModSource = async (id) => {
    await window.api.removeModSource({ id })
    await window.api.watchLibrary()
    loadStructure()
  }

  const handleRemovePaperSource = async (id) => {
    await window.api.removePaperPluginSource({ id })
    await window.api.watchLibrary()
    loadStructure()
  }

  const handleRemoveVelocitySource = async (id) => {
    await window.api.removeVelocityPluginSource({ id })
    await window.api.watchLibrary()
    loadStructure()
  }

  const handleAddModFile = async (loader, version) => {
    const filePath = await window.api.selectFile()
    if (!filePath) return
    await window.api.addLibraryItem({ category: 'mod', loader, version, srcPath: filePath })
    loadStructure()
  }

  const handleAddPaperFile = async (sourceId) => {
    const filePath = await window.api.selectFile()
    if (!filePath) return
    await window.api.addLibraryItem({ category: 'paper-plugin', srcPath: filePath, sourceId })
    loadStructure()
  }

  const handleAddVelocityFile = async (sourceId) => {
    const filePath = await window.api.selectFile()
    if (!filePath) return
    await window.api.addLibraryItem({ category: 'velocity-plugin', srcPath: filePath, sourceId })
    loadStructure()
  }

  return (
    <div>
      <div className="page-title">Mod / Plugin ライブラリ</div>

      <div className="tab-bar">
        <button className={`tab-btn ${tab === 'mods' ? 'active' : ''}`} onClick={() => setTab('mods')}>Mod</button>
        <button className={`tab-btn ${tab === 'paper' ? 'active' : ''}`} onClick={() => setTab('paper')}>Paper Plugin</button>
        <button className={`tab-btn ${tab === 'velocity' ? 'active' : ''}`} onClick={() => setTab('velocity')}>Velocity Plugin</button>
      </div>

      <div className="tab-content">
        {loading && <div style={{ color: 'var(--text-muted)', padding: 24 }}>読み込み中...</div>}

        {!loading && tab === 'mods' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 12 }}>
              <button className="btn btn-restart" onClick={() => setShowModrinth(true)}>
                🔍 Modrinthから検索
              </button>
              <button className="btn btn-start" onClick={() => setShowRegisterMod(true)}>＋ フォルダを登録</button>
            </div>
            {structure.mods.length === 0 ? (
              <div style={{ color: 'var(--text-dim)', fontSize: 14 }}>
                Modフォルダが登録されていません。「＋ フォルダを登録」からフォルダを指定してください。
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {structure.mods.map(source => (
                  <div key={source.id} style={{
                    background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: 12
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', minWidth: 0 }}>
                        <span style={{ background: 'var(--bg-tag-blue)', color: 'var(--text-accent-2)', fontSize: 12, padding: '2px 8px', borderRadius: 4, flexShrink: 0 }}>{source.loader}</span>
                        <span style={{ background: 'var(--bg-tag-blue)', color: '#4ade80', fontSize: 12, padding: '2px 8px', borderRadius: 4, flexShrink: 0 }}>{source.version}</span>
                        <span style={{ color: 'var(--text-dim)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{source.dir}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0, marginLeft: 8 }}>
                        <button className="btn btn-restart" style={{ fontSize: 11, padding: '2px 8px' }}
                          onClick={() => window.api.openFolder(source.dir)} title="フォルダを開く">📁</button>
                        <button
                          className="btn btn-restart"
                          style={{ fontSize: 11, padding: '2px 8px' }}
                          onClick={() => handleResolveNames(source)}
                          disabled={resolving === source.id || source.files.length === 0}
                          title="Modrinthから名前を取得"
                        >{resolving === source.id ? '取得中...' : '🔍 名前取得'}</button>
                        <button className="btn btn-restart" style={{ fontSize: 11, padding: '2px 8px' }}
                          onClick={() => handleAddModFile(source.loader, source.version)}>＋ 追加</button>
                        <button className="btn btn-stop" style={{ fontSize: 11, padding: '2px 8px' }}
                          onClick={() => handleRemoveModSource(source.id)}>登録解除</button>
                      </div>
                    </div>
                    {source.files.length === 0 ? (
                      <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>
                        このフォルダにModがありません。フォルダにJARファイルを追加すると自動で表示されます。
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {source.files.map(filename => (
                          <ItemRow
                            key={filename}
                            filename={filename}
                            displayName={modNames[filename]}
                            description={modDescriptions[filename]}
                            onNameChange={handleNameChange}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {!loading && tab === 'paper' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
              <button className="btn btn-start" onClick={() => setShowRegisterPaper(true)}>＋ フォルダを登録</button>
            </div>
            {structure.paperSources.length === 0 ? (
              <div style={{ color: 'var(--text-dim)', fontSize: 14 }}>
                Paper Pluginフォルダが登録されていません。「＋ フォルダを登録」からフォルダを指定してください。
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {structure.paperSources.map(source => (
                  <PluginSourceCard
                    key={source.id}
                    source={source}
                    categoryLabel="Plugin"
                    onAdd={() => handleAddPaperFile(source.id)}
                    onRemoveSource={() => handleRemovePaperSource(source.id)}
                    modNames={modNames}
                    modDescriptions={modDescriptions}
                    onNameChange={handleNameChange}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {!loading && tab === 'velocity' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
              <button className="btn btn-start" onClick={() => setShowRegisterVelocity(true)}>＋ フォルダを登録</button>
            </div>
            {structure.velocitySources.length === 0 ? (
              <div style={{ color: 'var(--text-dim)', fontSize: 14 }}>
                Velocity Pluginフォルダが登録されていません。「＋ フォルダを登録」からフォルダを指定してください。
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {structure.velocitySources.map(source => (
                  <PluginSourceCard
                    key={source.id}
                    source={source}
                    categoryLabel="Plugin"
                    onAdd={() => handleAddVelocityFile(source.id)}
                    onRemoveSource={() => handleRemoveVelocitySource(source.id)}
                    modNames={modNames}
                    modDescriptions={modDescriptions}
                    onNameChange={handleNameChange}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {showRegisterMod && (
        <RegisterModFolderModal onRegister={handleRegisterMod} onClose={() => setShowRegisterMod(false)} />
      )}
      {showRegisterPaper && (
        <RegisterFolderModal title="Paper Pluginフォルダを登録" onRegister={handleRegisterPaper} onClose={() => setShowRegisterPaper(false)} />
      )}
      {showRegisterVelocity && (
        <RegisterFolderModal title="Velocity Pluginフォルダを登録" onRegister={handleRegisterVelocity} onClose={() => setShowRegisterVelocity(false)} />
      )}
      {showModrinth && (
        <ModrinthModal
          modSources={structure.mods}
          onClose={() => setShowModrinth(false)}
          onDownloaded={loadStructure}
        />
      )}
    </div>
  )
}

export default ModManager
