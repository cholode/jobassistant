// 自动任务界面独立维护：候选链接导入、进度和每岗复盘，减少页面切换。
import { useState } from 'react';
import type { AgentState } from '../../../shared/protocol';
import type {
  ApplicationRecord,
  JobRecord,
  RecruitmentAction,
  RecruitmentConfig,
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
  source?: 'search' | 'selected';
  search_keyword?: string;
  search_page?: number;
  discovered_count?: number;
}

export function AutoQueuePanel({
  state,
  jobs,
  applications,
  busy,
  act,
  connected,
  agent,
  config,
}: {
  state: AutoQueueState;
  jobs: JobRecord[];
  applications: ApplicationRecord[];
  busy: boolean;
  act: (action: RecruitmentAction, payload?: unknown) => Promise<unknown>;
  connected: boolean;
  agent?: AgentState;
  config?: RecruitmentConfig;
}) {
  const [urls, setUrls] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [reviewEach, setReviewEach] = useState(false);
  const [source, setSource] = useState<'search' | 'selected'>('search');
  const [maxPages, setMaxPages] = useState(10);
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
  // 只提交仍可投递的选择；失效记录不应让按钮看起来已经准备就绪。
  const selectedIds = selected.filter((id) =>
    available.some((item) => item.job.id === id),
  );
  const startHint = !connected
    ? '等待本地服务连接后才能投递。'
    : source === 'search' &&
        (!config?.preferences.keywords.length || !config.profile.facts.length)
      ? '请先在“求职资料与规则”保存关键词和简历事实。'
      : source === 'selected' && !selectedIds.length && !urls.trim()
        ? '请粘贴职位链接，或展开下方列表选择已分析岗位。'
        : agent?.mode !== 'auto'
          ? '请将顶部运行模式切换为 Auto。'
          : agent.status !== 'running'
            ? '请点击顶部“恢复 Agent”。'
            : !Number.isInteger(target) || target < 1 || target > 100
              ? '本轮目标沟通数需为 1–100 的整数。'
              : source === 'search' &&
                  (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 30)
                ? '每个关键词的搜索页数需为 1–30 的整数。'
                : '';
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
      <h3>开始投递与逐岗复盘</h3>
      {state.source === 'search' && !!state.search_page && (
        <p className="reader-hint">
          搜索 {state.search_keyword} · 第 {state.search_page} 页 · 已发现{' '}
          {state.discovered_count || 0} 个候选
        </p>
      )}
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
            岗位来源
            <select
              aria-label="岗位来源"
              value={source}
              onChange={(e) => setSource(e.target.value as 'search' | 'selected')}
            >
              <option value="search">Agent 自主搜索（推荐）</option>
              <option value="selected">手动提供候选岗位</option>
            </select>
          </label>
          {source === 'search' ? (
            <>
              <p className="reader-hint">
                启动后 Agent
                自己搜索、翻页、读取详情、筛选和发起沟通，无需提供链接。请先在浏览器登录
                BOSS；软件保持运行即可。
              </p>
              <p className="reader-hint">
                关键词：{config?.preferences.keywords.join(' / ') || '未设置'}
                <br />
                城市：{config?.preferences.cities.join(' / ') || '不限'} · 经验：
                {config?.preferences.max_experience_months ?? 12} 个月以内
              </p>
              <label>
                每个关键词最多搜索页数
                <input
                  aria-label="每个关键词最多搜索页数"
                  type="number"
                  min={1}
                  max={30}
                  value={maxPages}
                  onChange={(e) => setMaxPages(Number(e.target.value))}
                />
              </label>
            </>
          ) : (
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
            </>
          )}
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
          <p className="reader-hint">
            默认自动继续下一岗，复盘记录仅自己可见。详情不符、招聘者超过七天未活跃或已沟通过会跳过。对方未回复前不发送附件。
          </p>
          <p
            className="reader-hint"
            id="auto-start-hint"
          >
            {startHint || '已就绪，可以开始本轮投递。'}
          </p>
          <button
            className="test-button start-application"
            aria-describedby="auto-start-hint"
            disabled={busy || Boolean(startHint)}
            onClick={() =>
              run('autoStart', {
                source,
                max_search_pages: maxPages,
                job_ids: source === 'selected' ? selectedIds : [],
                job_urls: source === 'selected' ? urls.split(/\s+/).filter(Boolean) : [],
                review_each: reviewEach,
                target_count: target,
              })
            }
          >
            {busy
              ? '正在启动…'
              : source === 'search'
                ? '启动 Agent 自动找岗并沟通'
                : '开始投递所选岗位'}
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
