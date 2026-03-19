import { useState } from 'react'
import ServerList from './components/ServerList'
import ModManager from './components/ModManager'
import './assets/main.css'

function App() {
  const [page, setPage] = useState('servers')

  return (
    <div className="app">
      <div className="sidebar">
        <div className="sidebar-title">⛏ MC Manager</div>
        <button
          className={`sidebar-btn ${page === 'servers' ? 'active' : ''}`}
          onClick={() => setPage('servers')}
        >
          サーバー管理
        </button>
        <button
          className={`sidebar-btn ${page === 'mods' ? 'active' : ''}`}
          onClick={() => setPage('mods')}
        >
          Mod管理
        </button>
      </div>
      <div className="content">
        {page === 'servers' && <ServerList />}
        {page === 'mods' && <ModManager />}
      </div>
    </div>
  )
}

export default App