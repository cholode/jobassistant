// 自动任务界面独立维护：候选链接导入、进度和每岗复盘，减少页面切换。
import { useState } from 'react';
import type {
  ApplicationRecord,
  JobRecord,
  RecruitmentAction,
} from '../../../shared/recruitment';

export interface ApplicationReview {
  application_id: string;
  company: string;
  title: string;
  url: string;
  message: string;
  receipt_verified: boolean;
  match_score: number;
  strengths: string[];
  private_gaps: string[];
  reviewed: boolean;
  notes?: string;
}

export interface AutoQueueState {
  status: string;
  message: string;
  items: { job_id: string; status: string; company?: string; reason?: string }[];
  sent_count?: number;
  reviewed_count?: number;
  target_count?: number;
  current_index?: number;
  total?: number;
  current_review?: ApplicationReview | null;
}

export function AutoQueuePanel({
  state,
  jobs,
  applications,
  busy,
  act,
}: {
  state: AutoQueueState;
  jobs: JobRecord[];
  applications: ApplicationRecord[];
  busy: boolean;
  act: (action: RecruitmentAction, payload?: unknown) => Promise<unknown>;
}) {
  const [urls, setUrls] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [reviewEach, setReviewEach] = useState(true);
  const [target, setTarget] = useState(20);
  const [notes, setNotes] = useState('');
  const active = ['running', 'awaiting_review', 'stopping'].includes(state.status);
  const review = state.current_review;
  const statusText: Record<string, string> = {
    idle: '待启动',
    running: '执行中',
    awaiting_review: '等待本岗复盘',
    stopping: '正在停止',
    stopped: '已停止',
    completed: '本轮结束',
  };
  const available = jobs.filter(
    (x) =>
      x.job.detail_complete &&
      x.analysis.decision === 'apply' &&
      !applications.some((a) => a.job_id === x.job.id),
  );
  const run = (action: RecruitmentAction, payload?: unknown) =>
    void act(action, payload).catch(() => {});
  async function submitReview(accepted: boolean) {
    if (!review) return;
    try {
      await act('autoReview', { application_id: review.application_id, notes, accepted });
      setNotes('');
    } catch {
      /* 错误由工作台统一展示，保留未提交的复盘文字。 */
    }
  }
  return (
    <>
      <h3>逐岗投递与复盘</h3>
      <p>
        已发送 {state.sent_count || 0}/{state.target_count || target} · 已复盘{' '}
        {state.reviewed_count || 0}
      </p>
      <p>
        {statusText[state.status] || state.status} · {state.message}
      </p>
      {state.status === 'awaiting_review' && review && (
        <article className="read-job application-review">
          <strong>
            {review.company} · {review.title}
          </strong>
          <p>
            匹配 {review.match_score}/100 ·{' '}
            {review.receipt_verified ? '发送回执已核实' : '回执待核实'}
          </p>
          <details open>
            <summary>实际发送内容</summary>
            <p className="read-text">{review.message}</p>
          </details>
          <details>
            <summary>匹配依据与私人缺口</summary>
            {review.strengths.map((s, i) => (
              <p key={`s${i}`}>匹配：{s}</p>
            ))}
            {review.private_gaps.map((s, i) => (
              <p key={`g${i}`}>仅本人：{s}</p>
            ))}
          </details>
          <textarea
            aria-label="本岗复盘意见"
            placeholder="核对岗位、介绍质量、回执及下一步改进"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <button
            className="test-button"
            disabled={busy || !notes.trim()}
            onClick={() => void submitReview(true)}
          >
            复盘通过，继续下一岗
          </button>
          <button
            className="test-button"
            disabled={busy || !notes.trim()}
            onClick={() => void submitReview(false)}
          >
            记录问题并停止
          </button>
        </article>
      )}
      {!active && (
        <>
          <label>
            候选职位链接（每行一个）
            <textarea
              aria-label="候选职位链接"
              value={urls}
              rows={4}
              placeholder="粘贴 BOSS 职位详情链接，自动去重、读取、筛选"
              onChange={(e) => setUrls(e.target.value)}
            />
          </label>
          <label>
            本轮目标沟通数
            <input
              aria-label="本轮目标沟通数"
              type="number"
              min={1}
              max={100}
              value={target}
              onChange={(e) => setTarget(Number(e.target.value))}
            />
          </label>
          <label className="queue-choice">
            <input
              type="checkbox"
              checked={reviewEach}
              onChange={(e) => setReviewEach(e.target.checked)}
            />
            每投一岗停下来复盘
          </label>
          <details>
            <summary>选择已分析岗位（{available.length}）</summary>
            {available.map((item) => (
              <label
                className="queue-choice"
                key={item.job.id}
              >
                <input
                  type="checkbox"
                  checked={selected.includes(item.job.id)}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? [...selected, item.job.id]
                        : selected.filter((x) => x !== item.job.id),
                    )
                  }
                />
                {item.job.company} · {item.job.title}
              </label>
            ))}
          </details>
          <p className="reader-hint">
            选择 Auto 并恢复 Agent
            后启动。链接只是候选，详情不符或已经沟通过会跳过；复盘仅自己可见。
          </p>
          <button
            className="test-button"
            disabled={busy || (!selected.length && !urls.trim())}
            onClick={() =>
              run('autoStart', {
                job_ids: selected,
                job_urls: urls.split(/\s+/).filter(Boolean),
                review_each: reviewEach,
                target_count: target,
              })
            }
          >
            启动所选岗位自动沟通
          </button>
        </>
      )}
      <button
        className="test-button"
        onClick={() => run('autoStop')}
      >
        停止自动任务
      </button>
      <details>
        <summary>本轮逐岗记录（{state.items.length}）</summary>
        {state.items.map((item, i) => (
          <p key={i}>
            {i + 1}. {item.company || item.job_id} · {item.status} {item.reason}
          </p>
        ))}
      </details>
    </>
  );
}
