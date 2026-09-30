// 招聘业务面板：组合资料编辑、岗位分析和投递确认组件。

import { useState } from 'react';
import type { AgentState } from '../../../shared/protocol';
import { useRecruitment } from '../../hooks/useRecruitment';
import { ProfileForm } from './ProfileForm';
import { ApprovalCard } from './ApprovalCard';

export function RecruitmentPanel({
  connected,
  agent,
  settings = false,
}: {
  connected: boolean;
  agent?: AgentState;
  settings?: boolean;
}) {
  // 界面只发业务动作；模型调用、审批校验和浏览器写入交给后端与适配器。
  const { state, busy, error, act } = useRecruitment(connected);
  const [navigationError, setNavigationError] = useState('');
  return (
    <section
      className="recruitment-panel"
      aria-label="职位分析与投递"
    >
      {error && (
        <p
          className="reader-error"
          role="alert"
        >
          {error}
        </p>
      )}
      {navigationError && (
        <p
          className="reader-error"
          role="alert"
        >
          {navigationError}
        </p>
      )}
      {!state ? (
        <p>正在加载本地求职记录…</p>
      ) : settings ? (
        <>
          <h3>求职资料与规则</h3>
          <p className="reader-hint">
            仅保存在本机。模型密钥通过本地 .env 配置，当前
            {state.model_configured ? '已配置' : '未配置'}。
          </p>
          <ProfileForm
            initial={state.config}
            busy={busy}
            save={(value) => void act('config', value)}
          />
        </>
      ) : (
        <>
          <button
            className="test-button"
            disabled={!connected || busy}
            onClick={() => void act('discover')}
          >
            {busy ? '处理中…' : '分析当前页面职位'}
          </button>
          <p className="reader-hint">
            先初筛，再打开详情重新分析。规则评分仅供参考。真实平台自动沟通尚未开放。
          </p>
          {!state.config.profile.facts.length && (
            <p className="reader-error">请先在“求职资料”填写简历事实。</p>
          )}
          {state.jobs.map((item) => (
            <article
              className="read-job"
              key={item.job.id}
            >
              <strong>{item.job.title}</strong>
              <p>
                {item.job.company} · {item.job.salary}
              </p>
              <p>
                {item.analysis.source === 'llm' ? '模型匹配' : '规则初筛'}{' '}
                {item.analysis.match_score}/100 ·{' '}
                {
                  { apply: '建议沟通', skip: '跳过', review: '需复核' }[
                    item.analysis.decision
                  ]
                }
              </p>
              <p>{item.analysis.reason}</p>
              <details open>
                <summary>匹配依据</summary>
                {item.analysis.strengths.map((x, i) => (
                  <p key={i}>✓ {x}</p>
                ))}
              </details>
              <details>
                <summary>缺口与待核实项</summary>
                {item.analysis.concerns.map((x, i) => (
                  <p key={i}>• {x}</p>
                ))}
              </details>
              <button
                className="test-button"
                disabled={busy}
                onClick={() => {
                  setNavigationError('');
                  void window.desktop
                    .navigate(item.job.url)
                    .catch((error) => setNavigationError(String(error)));
                }}
              >
                打开职位
              </button>
              <button
                className="test-button"
                disabled={
                  busy || !item.job.detail_complete || item.analysis.decision === 'skip'
                }
                onClick={() => void act('prepare', { job_id: item.job.id })}
              >
                生成投递确认卡
              </button>
            </article>
          ))}
          {!!state.applications.length && <h3>投递记录与确认</h3>}
          {state.applications.map((item) => (
            <ApprovalCard
              key={`${item.id}-${item.status}-${item.message}`}
              item={item}
              enabled={agent?.mode === 'copilot' && agent.status === 'running'}
              busy={busy}
              approve={(approved, message) =>
                void act('approve', { id: item.id, approved, message })
              }
            />
          ))}
          {!!state.events.length && (
            <details>
              <summary>最近流程记录</summary>
              {state.events
                .slice(-15)
                .reverse()
                .map((event, i) => (
                  <p key={i}>
                    {event.kind} · {new Date(event.time).toLocaleTimeString()}
                  </p>
                ))}
            </details>
          )}
        </>
      )}
    </section>
  );
}
