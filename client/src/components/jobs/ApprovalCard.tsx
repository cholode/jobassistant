// 投递确认卡：让用户审核消息，展示执行状态并提交确认或拒绝。

import { useState } from 'react';
import type { ApplicationRecord } from '../../../shared/recruitment';

const statuses: Record<string, string> = {
  WAITING_USER_CONFIRMATION: '待确认',
  WAITING_REPLY: '已沟通，等待回复',
  REJECTED: '已拒绝',
  ERROR: '执行前检查失败',
  UNCERTAIN: '结果不确定，请手动核对',
  CONTACTING: '正在发起沟通',
  CONTACTED: '已确认会话',
  SENDING: '正在发送',
  APPROVED: '已审批',
};
export function ApprovalCard({
  item,
  enabled,
  busy,
  approve,
}: {
  item: ApplicationRecord;
  enabled: boolean;
  busy: boolean;
  approve: (approved: boolean, message: string) => void;
}) {
  // 用户修改的是本地草稿，确认时才把最终文本提交给后端。
  const [message, setMessage] = useState(item.message);
  return (
    <article
      className="approval-card"
      data-testid="approval-card"
    >
      <strong>
        {item.company} · {item.title}
      </strong>
      <p>{statuses[item.status] ?? item.status}</p>
      <p className="reader-hint">{item.resume_policy}</p>
      {item.error && (
        <p
          role="alert"
          className="reader-error"
        >
          {item.error}
        </p>
      )}
      {item.status === 'WAITING_USER_CONFIRMATION' ? (
        <>
          <label>
            确认后补充的匹配说明
            <textarea
              aria-label="待确认招呼语"
              rows={6}
              maxLength={1500}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </label>
          <p className="reader-hint">
            将先点击开始沟通，再核对会话并发送上述消息；平台默认问候不会重复发送。
          </p>
          {!enabled && (
            <p className="reader-hint">执行前请在顶部选择 Copilot 并恢复 Agent。</p>
          )}
          <button
            className="test-button"
            disabled={busy || !enabled || !message.trim()}
            onClick={() => approve(true, message)}
          >
            确认沟通并发送此消息
          </button>
          <button
            className="test-button"
            disabled={busy}
            onClick={() => approve(false, message)}
          >
            拒绝此次投递
          </button>
        </>
      ) : (
        <details>
          <summary>查看已确认消息</summary>
          <p className="read-text">{item.message}</p>
        </details>
      )}
    </article>
  );
}
