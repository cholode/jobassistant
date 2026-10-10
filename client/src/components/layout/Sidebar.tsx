import {
  Bot,
  ChevronDown,
  Compass,
  BriefcaseBusiness,
  MessageSquare,
  SquareCheckBig,
  History,
  Settings2,
  ShieldCheck,
  Play,
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
          <Bot
            size={34}
            strokeWidth={2.5}
          />
        </span>
        <span>
          Job Agent<small>让好工作，主动找你</small>
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
          className={`nav-item start-application ${tab === 'dashboard' ? 'selected' : ''}`}
          aria-current={tab === 'dashboard' ? 'page' : undefined}
          onClick={() => setTab('dashboard')}
        >
          <Play size={18} />
          开始投递
        </button>
        <button
          className={`nav-item ${tab === 'overview' ? 'active' : ''}`}
          aria-current={tab === 'overview' ? 'page' : undefined}
          onClick={() => setTab('overview')}
        >
          <Compass size={18} />
          招聘浏览器
          <span className="nav-dot" />
        </button>
        {[
          { icon: MessageSquare, text: '沟通消息', tab: 'chats' },
          { icon: SquareCheckBig, text: '投递历史与核对', tab: 'history' },
          { icon: History, text: 'Agent 执行追踪', tab: 'traces' },
          { icon: Settings2, text: '模型设置', tab: 'model' },
        ].map(({ icon: Icon, text, tab: target }) => (
          <button
            key={target}
            className={`nav-item ${tab === target ? 'selected' : ''}`}
            aria-current={tab === target ? 'page' : undefined}
            onClick={() => setTab(target as PanelTab)}
          >
            <Icon size={18} />
            {text}
          </button>
        ))}
        <button
          className={`nav-item ${tab === 'jobs' ? 'selected' : ''}`}
          aria-current={tab === 'jobs' ? 'page' : undefined}
          onClick={() => setTab('jobs')}
        >
          <BriefcaseBusiness size={18} />
          职位与投递
        </button>
        <button
          className={`nav-item ${tab === 'activity' ? 'selected' : ''}`}
          aria-current={tab === 'activity' ? 'page' : undefined}
          onClick={() => setTab('activity')}
        >
          <History size={18} />
          运行记录<span className="count">{logCount}</span>
        </button>
      </nav>
      <div className="sidebar-bottom">
        <div className="sidebar-cheer">
          <strong>
            AI 与你一起
            <br />
            找到更好的可能
          </strong>
          <span>Good Job! ✦</span>
        </div>
        <button
          className={`nav-item ${tab === 'settings' ? 'selected' : ''}`}
          aria-current={tab === 'settings' ? 'page' : undefined}
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
