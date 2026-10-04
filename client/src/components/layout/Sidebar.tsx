import {
  Command,
  ChevronDown,
  Compass,
  BriefcaseBusiness,
  MessageSquare,
  SquareCheckBig,
  History,
  Settings2,
  ShieldCheck,
} from 'lucide-react';
import type { PanelTab } from '../agent/AgentPanel';

interface Props {
  tab: PanelTab;
  setTab: (tab: PanelTab) => void;
  logCount: number;
  setTip: (tip: string) => void;
}
export function Sidebar({ tab, setTab, logCount }: Props) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark">
          <Command size={23} />
        </span>
        <span>
          Job Agent<small>你的求职副驾驶</small>
        </span>
      </div>
      <div className="workspace">
        <span className="avatar">W</span>
        <div>
          个人工作空间<small>Local workspace</small>
        </div>
        <ChevronDown size={14} />
      </div>
      <div className="nav-label">工作台</div>
      <nav>
        <button
          className="nav-item active"
          onClick={() => setTab('overview')}
        >
          <Compass size={18} />
          招聘浏览器
          <span className="nav-dot" />
        </button>
        {[
          { icon: MessageSquare, text: '沟通消息', tab: 'chats' },
          { icon: SquareCheckBig, text: '投递历史与核对', tab: 'history' },
          { icon: BriefcaseBusiness, text: '自动任务看板', tab: 'dashboard' },
          { icon: History, text: 'Agent 执行追踪', tab: 'traces' },
          { icon: Settings2, text: '模型设置', tab: 'model' },
        ].map(({ icon: Icon, text, tab: target }) => (
          <button
            key={target}
            className={`nav-item ${tab === target ? 'selected' : ''}`}
            onClick={() => setTab(target as PanelTab)}
          >
            <Icon size={18} />
            {text}
          </button>
        ))}
        <button
          className="nav-item"
          onClick={() => setTab('jobs')}
        >
          <BriefcaseBusiness size={18} />
          职位与投递
        </button>
        <button
          className={`nav-item ${tab === 'activity' ? 'selected' : ''}`}
          onClick={() => setTab('activity')}
        >
          <History size={18} />
          运行记录<span className="count">{logCount}</span>
        </button>
      </nav>
      <div className="sidebar-bottom">
        <div className="phase-card">
          <div>
            <span className="tiny-dot" /> PHASE 06 <span>已就绪</span>
          </div>
          <strong>有记录，可暂停，可核对。</strong>
          <p>
            浏览网页，连接后端，
            <br />
            随时暂停并接管。
          </p>
          <div className="phase-progress">
            <i />
          </div>
          <small>自动任务与执行追踪</small>
        </div>
        <button
          className="nav-item"
          onClick={() => setTab('settings')}
        >
          <Settings2 size={17} />
          求职资料与规则
        </button>
        <div className="profile">
          <span className="profile-avatar">我</span>
          <div>
            我的求职空间<small>数据保留在本机</small>
          </div>
          <ShieldCheck size={16} />
        </div>
      </div>
    </aside>
  );
}
