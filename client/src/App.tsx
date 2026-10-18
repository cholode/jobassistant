import { useEffect, useState } from 'react';
import { Loader2, Pause, Play, CircleHelp } from 'lucide-react';
import { useDesktop } from './hooks/useDesktop';
import { useAction } from './hooks/useAction';
import { BrowserPane } from './components/browser/BrowserPane';
import { Sidebar } from './components/layout/Sidebar';
import { AgentPanel, type PanelTab } from './components/agent/AgentPanel';
import { WorkspaceSummary } from './components/layout/WorkspaceSummary';
import { ResizableWorkArea } from './components/layout/ResizableWorkArea';

export default function App() {
  const data = useDesktop();
  const { busy, error, setError, run } = useAction();
  const [tab, setTab] = useState<PanelTab>('overview');
  const [tip, setTip] = useState('');
  useEffect(() => {
    if (!tip) return;
    const id = setTimeout(() => setTip(''), 5000);
    return () => clearTimeout(id);
  }, [tip]);
  const connected = Boolean(data?.connected);
  const running = data?.agent.status === 'running';
  const logs = data?.logs ?? [];
  // 界面由左侧导航、中央浏览器占位区和右侧状态面板组成。
  return (
    <div className="app-shell">
      <Sidebar
        tab={tab}
        setTab={setTab}
        logCount={logs.length}
        setTip={setTip}
      />
      <main className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            工作台 <span>/</span>
            <strong>招聘浏览器</strong>
          </div>
          <div className="top-actions">
            <div
              className="mode-switch"
              role="group"
              aria-label="运行模式"
            >
              {(['manual', 'copilot', 'auto'] as const).map((mode) => (
                <button
                  key={mode}
                  aria-label={
                    {
                      manual: 'Manual 手动',
                      copilot: 'Copilot 智能协作',
                      auto: 'Auto 自动执行',
                    }[mode]
                  }
                  aria-pressed={(data?.agent.mode ?? 'manual') === mode}
                  disabled={!connected || busy}
                  onClick={() => void run(() => window.desktop.agentAction(mode))}
                >
                  {{ manual: 'Manual', copilot: 'Copilot', auto: 'Auto' }[mode]}
                  <span>
                    {{ manual: '手动', copilot: '智能协作', auto: '自动执行' }[mode]}
                  </span>
                </button>
              ))}
            </div>
            <button
              className={`control-button ${running ? 'pause' : 'resume'}`}
              disabled={!connected || busy}
              onClick={() =>
                void run(() => window.desktop.agentAction(running ? 'pause' : 'resume'))
              }
            >
              {busy ? (
                <Loader2
                  size={16}
                  className="spin"
                />
              ) : running ? (
                <Pause size={16} />
              ) : (
                <Play size={16} />
              )}{' '}
              {running ? '暂停 Agent' : '恢复 Agent'}
            </button>
            <span className={`connection ${connected ? 'online' : ''}`}>
              <i />
              {connected ? '本地服务已连接' : '正在连接本地服务'}
            </span>
            <span className="divider" />
            <button
              className="icon-button"
              aria-label="使用提示"
              onClick={() =>
                setTip(
                  '可在模拟站内浏览职位和聊天。Pause 仅暂停协调流程，你仍可自由操作网页。',
                )
              }
            >
              <CircleHelp size={18} />
            </button>
            <span className="user-circle">W</span>
          </div>
        </header>
        <WorkspaceSummary
          connected={connected}
          setTab={setTab}
        />
        <ResizableWorkArea
          browser={
            <BrowserPane
              data={data}
              run={run}
            />
          }
          panel={
            <AgentPanel
              data={data}
              tab={tab}
              setTab={setTab}
              busy={busy}
              run={run}
            />
          }
        />
        <footer className="statusbar">
          <span>
            <i className={connected ? 'status-green' : 'status-gray'} />
            {connected ? '系统就绪' : '服务离线'}
            <span className="status-separator">/</span>
            {running ? '工作流运行中' : '手动接管中'}
          </span>
          <span>
            <span className="keyboard">
              {(data?.agent.mode || 'manual').toUpperCase()}
            </span>{' '}
            可随时暂停接管
            <span className="status-separator">·</span>v0.0.1
          </span>
        </footer>
      </main>
      {(error || tip) && (
        <div
          role="status"
          className={`toast ${error ? 'error' : ''}`}
          onClick={() => {
            setError('');
            setTip('');
          }}
        >
          {error || tip}
          <button aria-label="关闭提示">×</button>
        </div>
      )}
    </div>
  );
}
