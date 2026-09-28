import { useEffect, useState } from 'react';
import { Loader2, Pause, Play, CircleHelp } from 'lucide-react';
import { useDesktop } from './hooks/useDesktop';
import { useAction } from './hooks/useAction';
import { BrowserPane } from './components/browser/BrowserPane';
import { Sidebar } from './components/layout/Sidebar';
import { AgentPanel, type PanelTab } from './components/agent/AgentPanel';

export default function App() {
  const data = useDesktop();
  const { busy, error, setError, run } = useAction();
  const [tab, setTab] = useState<PanelTab>('overview');
  const [tip, setTip] = useState('');
  useEffect(() => { if (!tip) return; const id = setTimeout(() => setTip(''), 5000); return () => clearTimeout(id); }, [tip]);
  const connected = Boolean(data?.connected);
  const running = data?.agent.status === 'running';
  const logs = data?.logs ?? [];
  // 界面由左侧导航、中央浏览器占位区和右侧状态面板组成。
  return <div className="app-shell">
    <Sidebar tab={tab} setTab={setTab} logCount={logs.length} setTip={setTip}/>
    <main className="main-shell">
      <header className="topbar"><div className="breadcrumb">工作台 <span>/</span><strong>招聘浏览器</strong></div><div className="top-actions"><button className={`control-button ${running ? 'pause' : 'resume'}`} disabled={!connected || busy} onClick={() => void run(() => window.desktop.agentAction(running ? 'pause' : 'resume'))}>{busy ? <Loader2 size={16} className="spin"/> : running ? <Pause size={16}/> : <Play size={16}/>} {running ? '暂停 Agent' : '恢复 Agent'}</button><span className={`connection ${connected ? 'online' : ''}`}><i/>{connected ? '本地服务已连接' : '正在连接本地服务'}</span><span className="divider"/><button className="icon-button" aria-label="使用提示" onClick={() => setTip('可在模拟站内浏览职位和聊天。Pause 仅暂停协调流程，你仍可自由操作网页。')}><CircleHelp size={18}/></button><span className="user-circle">W</span></div></header>
      <div className="work-area"><BrowserPane data={data} run={run}/>
      <AgentPanel data={data} tab={tab} setTab={setTab} busy={busy} run={run}/></div>
      <footer className="statusbar"><span><i className={connected ? 'status-green' : 'status-gray'}/>{connected ? '系统就绪' : '服务离线'}<span className="status-separator">/</span>{running ? '工作流运行中' : '手动接管中'}</span><span><span className="keyboard">MANUAL</span> 网页可自由操作<span className="status-separator">·</span>v0.0.1</span></footer>
    </main>{(error || tip) && <div role="status" className={`toast ${error ? 'error' : ''}`} onClick={() => { setError(''); setTip(''); }}>{error || tip}<button aria-label="关闭提示">×</button></div>}
  </div>;
}

