import { useEffect, useState } from 'react';
import { Search, Funnel, ClipboardCheck, Bot, Sparkles } from 'lucide-react';
import type { PanelTab } from '../agent/AgentPanel';

type Stats = { jobs: number; recommended: number; pending: number };

// Read persisted counts; never substitute sample numbers or stale offline values.
export function WorkspaceSummary({
  connected,
  setTab,
}: {
  connected: boolean;
  setTab: (tab: PanelTab) => void;
}) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!connected) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        const result = (await window.desktop.recruitment('console')) as { stats: Stats };
        if (!disposed) {
          setStats(result.stats);
          setFailed(false);
        }
      } catch {
        if (!disposed) {
          setStats(null);
          setFailed(true);
        }
      } finally {
        if (!disposed) timer = setTimeout(() => void refresh(), 3000);
      }
    }
    setStats(null);
    setFailed(false);
    void refresh();
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [connected]);
  const cards = [
    { key: 'jobs', label: '发现岗位', note: '已保存的岗位', icon: Search, tab: 'jobs' },
    {
      key: 'recommended',
      label: '推荐沟通',
      note: '通过匹配分析',
      icon: Funnel,
      tab: 'jobs',
    },
    {
      key: 'pending',
      label: '待确认',
      note: '审核后再出发',
      icon: ClipboardCheck,
      tab: 'jobs',
    },
  ] as const;
  return (
    <section
      className="workspace-summary"
      aria-label="求职进度"
    >
      {cards.map(({ key, label, note, icon: Icon, tab }) => (
        <button
          key={key}
          className={`summary-card summary-${key}`}
          onClick={() => setTab(tab)}
        >
          <span className="summary-heading">
            <Icon
              size={24}
              strokeWidth={2.5}
            />
            {label}
          </span>
          <span className="summary-content">
            <strong>{connected && stats ? stats[key] : '—'}</strong>
            <span>
              {!connected
                ? '等待连接'
                : failed
                  ? '暂不可用，重试中'
                  : !stats
                    ? '正在读取…'
                    : note}
              <small>查看详情 ↗</small>
            </span>
          </span>
        </button>
      ))}
      <div className="summary-cheer">
        <div>
          好工作
          <br />
          正在靠近你！<small>每一步，都算数。</small>
        </div>
        <Bot
          size={66}
          strokeWidth={2}
        />
        <Sparkles
          className="cheer-star"
          size={21}
        />
      </div>
    </section>
  );
}
