// Phase 6 工作台：持久历史、统计、自动队列、聊天快照和执行追踪。
import { useCallback, useEffect, useState } from 'react';
import type {
  ApplicationRecord,
  RecruitmentAction,
  RecruitmentState,
} from '../../../shared/recruitment';
import { ModelSettingsForm } from './ModelSettingsForm';
import {
  AutoQueuePanel,
  type AutoQueueState,
  type ApplicationReview,
} from './AutoQueuePanel';

interface ConsoleState {
  stats: Record<string, number>;
  applications: (ApplicationRecord & {
    updated_at: string;
    job: { url: string };
    review?: ApplicationReview;
  })[];
  events: { kind: string; subject: string; time: string; details: string }[];
  traces: {
    run_id: string;
    status: string;
    decision?: string;
    reflection?: { feedback?: string[] };
    trace: { tool: string; purpose: string; status: string }[];
  }[];
  chats: {
    id: string;
    title: string;
    url: string;
    updated_at: string;
    messages: { sender: string; text: string }[];
  }[];
  auto: AutoQueueState;
  model: { model: string; base_url: string; configured: boolean };
}

export function ConsolePanel({
  view,
  connected,
}: {
  view: 'dashboard' | 'history' | 'chats' | 'traces' | 'model';
  connected: boolean;
}) {
  const [state, setState] = useState<ConsoleState | null>(null);
  const [jobs, setJobs] = useState<RecruitmentState['jobs']>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    const [data, recruitment] = await Promise.all([
      window.desktop.recruitment('console'),
      window.desktop.recruitment('state'),
    ]);
    setState(data as ConsoleState);
    setJobs((recruitment as RecruitmentState).jobs);
  }, []);
  useEffect(() => {
    if (!connected) return;
    let disposed = false;
    const poll = async () => {
      try {
        if (!disposed) await refresh();
      } catch (e) {
        if (!disposed) setError(String(e));
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 3000);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [connected, refresh]);
  async function act(action: RecruitmentAction, payload?: unknown) {
    setBusy(true);
    setError('');
    try {
      const result = await window.desktop.recruitment(action, payload);
      await refresh();
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作失败');
      throw e;
    } finally {
      setBusy(false);
    }
  }
  const run = (action: RecruitmentAction, payload?: unknown) =>
    void act(action, payload).catch(() => {});
  if (!state) return <p>{error || '正在加载工作台…'}</p>;
  return (
    <section className="recruitment-panel">
      {error && (
        <p
          role="alert"
          className="reader-error"
        >
          {error}
        </p>
      )}
      {view === 'model' && (
        <ModelSettingsForm
          initial={state.model}
          busy={busy}
          act={act}
        />
      )}
      {view === 'dashboard' && (
        <AutoQueuePanel
          state={state.auto}
          jobs={jobs}
          applications={state.applications}
          busy={busy}
          act={act}
        />
      )}
      {view === 'history' && (
        <>
          <h3>投递历史与异常核对</h3>
          <input
            aria-label="筛选投递历史"
            placeholder="搜索公司、岗位或状态"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {state.applications
            .filter((x) =>
              `${x.company} ${x.title} ${x.status}`
                .toLowerCase()
                .includes(query.toLowerCase()),
            )
            .map((item) => (
              <article
                className="read-job"
                key={item.id}
              >
                <strong>
                  {item.company} · {item.title}
                </strong>
                <p>
                  {item.status} · {new Date(item.updated_at).toLocaleString()}
                </p>
                <p>{item.error}</p>
                {item.review && (
                  <details>
                    <summary>本岗复盘（仅本人）</summary>
                    <p>{item.review.notes || '尚未填写人工复盘'}</p>
                    {item.review.private_gaps.map((gap, i) => (
                      <p key={i}>{gap}</p>
                    ))}
                  </details>
                )}
                <details>
                  <summary>已确认消息</summary>
                  <p className="read-text">{item.message}</p>
                </details>
                <button
                  className="test-button"
                  onClick={() =>
                    void window.desktop
                      .navigate(item.job.url)
                      .catch((e) => setError(String(e)))
                  }
                >
                  查看原岗位
                </button>
                {item.status === 'UNCERTAIN' && (
                  <>
                    <p>请先人工检查实际聊天，核对后归档。此操作不会重发。</p>
                    <button
                      className="test-button"
                      disabled={busy}
                      onClick={() => run('resolve', { id: item.id, sent: true })}
                    >
                      已核实发送成功
                    </button>
                    <button
                      className="test-button"
                      disabled={busy}
                      onClick={() => run('resolve', { id: item.id, sent: false })}
                    >
                      未完成，归档不重发
                    </button>
                  </>
                )}
              </article>
            ))}
        </>
      )}
      {view === 'chats' && (
        <>
          <h3>沟通记录</h3>
          <p className="reader-hint">
            打开招聘网站中的会话后读取快照；只保存当前已加载消息，不自动回复。
          </p>
          <button
            className="test-button"
            disabled={busy}
            onClick={() => run('captureChat')}
          >
            记录当前聊天
          </button>
          {state.chats.map((chat) => (
            <article
              className="read-job"
              key={chat.id}
            >
              <strong>{chat.title}</strong>
              <p>{new Date(chat.updated_at).toLocaleString()}</p>
              {chat.messages.map((message, i) => (
                <p
                  className="read-text"
                  key={i}
                >
                  {message.sender === 'me'
                    ? '我'
                    : message.sender === 'hr'
                      ? '招聘方'
                      : '未知'}
                  ：{message.text}
                </p>
              ))}
            </article>
          ))}
        </>
      )}
      {view === 'traces' && (
        <>
          <h3>Agent 执行追踪</h3>
          {state.traces.map((trace) => (
            <details
              key={trace.run_id}
              className="read-job"
            >
              <summary>
                {trace.status} · {trace.decision || '执行未完成'}
              </summary>
              <p>{trace.run_id}</p>
              {trace.trace.map((step, i) => (
                <p key={i}>
                  {i + 1}. {step.tool} · {step.status}
                  <br />
                  {step.purpose}
                </p>
              ))}
              {trace.reflection?.feedback?.map((text, i) => (
                <p key={i}>复核：{text}</p>
              ))}
            </details>
          ))}
          <h3>持久化事件</h3>
          {state.events.slice(0, 50).map((event, i) => (
            <p key={i}>
              {new Date(event.time).toLocaleString()} · {event.kind}
              <br />
              {event.details}
            </p>
          ))}
        </>
      )}
    </section>
  );
}
