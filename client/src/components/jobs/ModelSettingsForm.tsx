// 模型密钥仅输入和保存，不从后端取回或显示已有密钥。
import { useState } from 'react';
import type { RecruitmentAction } from '../../../shared/recruitment';

export function ModelSettingsForm({
  initial,
  busy,
  act,
}: {
  initial: { model: string; base_url: string; configured: boolean };
  busy: boolean;
  act: (action: RecruitmentAction, payload?: unknown) => Promise<unknown>;
}) {
  const [model, setModel] = useState(initial.model);
  const [url, setUrl] = useState(initial.base_url);
  const [key, setKey] = useState('');
  const [notice, setNotice] = useState('');
  return (
    <form
      className="profile-form"
      onSubmit={(e) => {
        e.preventDefault();
        void act('modelSave', { model, base_url: url, api_key: key || null })
          .then(() => {
            setKey('');
            setNotice('已保存模型设置');
          })
          .catch(() => {});
      }}
    >
      <h3>模型设置</h3>
      <p>
        密钥{initial.configured ? '已配置' : '未配置'}
        。模型分析会发送岗位及个人资料到配置的服务。
      </p>
      <label>
        API 地址
        <input
          required
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
      </label>
      <label>
        模型名称
        <input
          required
          value={model}
          onChange={(e) => setModel(e.target.value)}
        />
      </label>
      <label>
        API Key（留空保留原密钥）
        <input
          type="password"
          autoComplete="off"
          value={key}
          onChange={(e) => setKey(e.target.value)}
        />
      </label>
      <button
        className="test-button"
        disabled={busy}
      >
        保存模型设置
      </button>
      <button
        type="button"
        className="test-button"
        disabled={busy}
        onClick={() =>
          void act('modelTest')
            .then((r) => setNotice((r as { message: string }).message))
            .catch(() => {})
        }
      >
        测试已保存的连接
      </button>
      <p role="status">{notice}</p>
    </form>
  );
}
