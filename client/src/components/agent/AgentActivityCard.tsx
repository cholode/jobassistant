// 常驻状态条：显示后端实际步骤，断线时明确标记最后一次状态。
import { CircleCheck, CirclePause, Loader2, AlertCircle } from 'lucide-react';
import type { AgentState } from '../../../shared/protocol';

export function AgentActivityCard({
  agent,
  connected,
}: {
  agent?: AgentState;
  connected: boolean;
}) {
  const activity = agent?.activity;
  const working = connected && activity?.status === 'working';
  const label = !connected
    ? '连接已断开，等待重连'
    : activity?.label ||
      (agent?.status === 'running' ? '已就绪，等待任务' : 'Agent 已暂停');
  const Icon = working
    ? Loader2
    : activity?.status === 'error' && connected
      ? AlertCircle
      : activity?.status === 'done' && connected
        ? CircleCheck
        : CirclePause;
  return (
    <section
      className="agent-activity-card"
      aria-label="Agent 当前任务"
      aria-live="polite"
      data-status={!connected ? 'offline' : activity?.status || 'idle'}
    >
      <div className="agent-activity-heading">
        <Icon
          size={16}
          className={working ? 'spin' : undefined}
        />
        <strong>{label}</strong>
      </div>
      {activity?.title && (
        <p
          className="agent-activity-job"
          title={`${activity.company} · ${activity.title}`}
        >
          {activity.company} · {activity.title}
        </p>
      )}
      {activity?.detail && <p className="agent-activity-detail">{activity.detail}</p>}
      {!!activity?.total && (
        <p className="agent-activity-progress">
          候选 {activity.current_index ?? 0}/{activity.total} · 已沟通{' '}
          {activity.sent_count ?? 0}/{activity.target_count ?? 0}
        </p>
      )}
      {!connected && activity && <small>最后状态：{activity.label}，当前进度未知</small>}
      {connected && agent?.status === 'paused' && activity && (
        <small>新操作已暂停{working ? '，当前步骤结束后停止写入' : ''}</small>
      )}
      {!activity && connected && (
        <small>启动分析或自动任务后，这里会显示实际执行步骤。</small>
      )}
    </section>
  );
}
