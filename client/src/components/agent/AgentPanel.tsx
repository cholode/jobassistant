import {
  Sparkles,
  Pause,
  Radio,
  Globe2,
  BriefcaseBusiness,
  ArrowUpRight,
  Link2,
  Check,
  Zap,
  ArrowRight,
  History,
  ShieldCheck,
} from 'lucide-react';
import type { Snapshot } from '../../../shared/protocol';
import { RecruitmentPanel } from '../jobs/RecruitmentPanel';
import { PageReader } from './PageReader';
export type PanelTab = 'overview' | 'activity' | 'jobs' | 'settings';
interface Props {
  data: Snapshot | null;
  tab: PanelTab;
  setTab: (tab: PanelTab) => void;
  busy: boolean;
  run: (action: () => Promise<void>) => Promise<void>;
}
export function AgentPanel({ data, tab, setTab, busy, run }: Props) {
  const connected = Boolean(data?.connected);
  const running = data?.agent.status === 'running';
  const logs = data?.logs ?? [];
  const url = data?.browser.url ?? '';
  return (
    <aside className="copilot">
      <div className="copilot-title">
        <span className="sparkle-box">
          <Sparkles size={18} />
        </span>
        <div>
          <strong>Agent Copilot</strong>
          <small>与你一起，找到更合适的工作</small>
        </div>
        <span className="live-dot" />
      </div>
      <div className="panel-tabs">
        <button
          className={tab === 'overview' ? 'chosen' : ''}
          onClick={() => setTab('overview')}
        >
          工作状态
        </button>
        <button
          className={tab === 'activity' ? 'chosen' : ''}
          onClick={() => setTab('activity')}
        >
          运行记录 <span>{logs.length}</span>
        </button>
      </div>
      <div className="panel-body">
        {tab === 'jobs' || tab === 'settings' ? (
          <RecruitmentPanel
            connected={connected}
            agent={data?.agent}
            settings={tab === 'settings'}
          />
        ) : tab === 'overview' ? (
          <>
            <div className={`agent-state-card ${running ? 'running' : ''}`}>
              <div className="state-icon">
                {running ? <Radio size={23} /> : <Pause size={22} />}
              </div>
              <span className="state-label">
                {!connected ? '等待后端连接' : running ? '工作流已恢复' : 'Agent 已暂停'}
              </span>
              <p>
                {running ? '连接与页面状态同步中。' : '放心浏览，网页现在由你接管。'}
                <br />
                Copilot 仅执行逐条确认的沟通，不发送附件。
              </p>
              <span className="manual-pill">
                <span /> {data?.agent.mode === 'copilot' ? 'COPILOT MODE' : 'MANUAL MODE'}
              </span>
            </div>
            <div className="section-caption">
              当前页面 <Globe2 size={14} />
            </div>
            <div className="page-info">
              <span className="page-icon">
                <BriefcaseBusiness size={18} />
              </span>
              <div>
                <strong>{data?.browser.title || '等待页面加载'}</strong>
                <small>
                  {url.includes('/mock/') ? '本地模拟招聘平台' : '外部招聘网站'}
                </small>
              </div>
              <ArrowUpRight size={15} />
            </div>
            <button
              className="test-button"
              onClick={() => setTab('jobs')}
            >
              职位分析与投递
            </button>
            <button
              className="test-button"
              onClick={() => setTab('settings')}
            >
              求职资料与规则
            </button>
            <PageReader
              connected={connected}
              page={data?.browser}
            />
            <div className="section-caption">
              连接检查 <Link2 size={14} />
            </div>
            <div className="connection-list">
              <div>
                <span>
                  <i className="check-icon">
                    <Check size={12} />
                  </i>
                  Electron 浏览器
                </span>
                <b>已就绪</b>
              </div>
              <div>
                <span>
                  <i className={connected ? 'check-icon' : 'muted-icon'}>
                    <Check size={12} />
                  </i>
                  Python 后端
                </span>
                <b>{connected ? '已连接' : '重连中'}</b>
              </div>
              <div>
                <span>
                  <i className={connected ? 'check-icon' : 'muted-icon'}>
                    <Check size={12} />
                  </i>
                  WebSocket 通道
                </span>
                <b>{connected ? `${data?.latency ?? '—'} ms` : '离线'}</b>
              </div>
            </div>
            <button
              className="test-button"
              disabled={!connected || busy}
              onClick={() => void run(() => window.desktop.agentAction('ping'))}
            >
              <Zap size={14} />
              测试双向通信
              <ArrowRight size={14} />
            </button>
            <div className="mini-activity">
              <div className="section-caption">
                最近活动
                <button onClick={() => setTab('activity')}>
                  查看全部 <ArrowRight size={12} />
                </button>
              </div>
              {logs.slice(0, 2).map((entry) => (
                <div
                  className="mini-event"
                  key={entry.id}
                >
                  <i className={entry.kind} />
                  <p>
                    {entry.text}
                    <small>
                      {new Date(entry.time).toLocaleTimeString('zh-CN', {
                        hour12: false,
                      })}
                    </small>
                  </p>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="activity-list">
            <div className="section-caption">
              本次会话 · {logs.length} 条事件
              <History size={14} />
            </div>
            {logs.map((entry) => (
              <div
                className="event"
                key={entry.id}
              >
                <i className={entry.kind} />
                <div>
                  <span>{entry.text}</span>
                  <small>
                    {new Date(entry.time).toLocaleTimeString('zh-CN', { hour12: false })}
                  </small>
                </div>
              </div>
            ))}
            <p className="session-note">运行记录保存在内存中，最多展示 80 条。</p>
          </div>
        )}
      </div>
      <div className="copilot-footer">
        <ShieldCheck size={13} />
        重要决定，始终由你确认。
      </div>
    </aside>
  );
}
