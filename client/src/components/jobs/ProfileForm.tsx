// 求职资料表单：在本地编辑副本，提交时整体保存个人事实与筛选偏好。

import { useState } from 'react';
import type { RecruitmentConfig } from '../../../shared/recruitment';

export function ProfileForm({
  initial,
  busy,
  save,
}: {
  initial: RecruitmentConfig;
  busy: boolean;
  save: (value: RecruitmentConfig) => void;
}) {
  // 输入不立即写数据库；保存时整体提交，未确认的时间字段使用 null。
  const [value, setValue] = useState(initial);
  // 编辑时保留末尾分隔符；保存时由后端统一清理空项。
  const list = (text: string) => text.split(/[,，\n]/).map((x) => x.trim());
  return (
    <form
      className="profile-form"
      onSubmit={(event) => {
        event.preventDefault();
        save(value);
      }}
    >
      <label>
        姓名
        <input
          aria-label="求职姓名"
          value={value.profile.name}
          onChange={(e) =>
            setValue({ ...value, profile: { ...value.profile, name: e.target.value } })
          }
        />
      </label>
      <label>
        技能（逗号分隔）
        <input
          aria-label="求职技能"
          value={value.profile.skills.join(',')}
          onChange={(e) =>
            setValue({
              ...value,
              profile: { ...value.profile, skills: list(e.target.value) },
            })
          }
        />
      </label>
      <label>
        简历事实（每行一条）
        <textarea
          aria-label="简历事实"
          rows={5}
          value={value.profile.facts.join('\n')}
          onChange={(e) =>
            setValue({
              ...value,
              profile: { ...value.profile, facts: e.target.value.split('\n') },
            })
          }
        />
      </label>
      <p className="reader-hint">
        填写可以向招聘方陈述的真实经历。招呼语只引用这里的事实；附件不会自动发送。
      </p>
      <label>
        每周可实习天数
        <input
          type="number"
          min={1}
          max={7}
          value={value.profile.days_per_week ?? ''}
          onChange={(e) =>
            setValue({
              ...value,
              profile: {
                ...value.profile,
                days_per_week: e.target.value ? Number(e.target.value) : null,
              },
            })
          }
        />
      </label>
      <label>
        至少可实习月数
        <input
          type="number"
          min={1}
          max={36}
          value={value.profile.months ?? ''}
          onChange={(e) =>
            setValue({
              ...value,
              profile: {
                ...value.profile,
                months: e.target.value ? Number(e.target.value) : null,
              },
            })
          }
        />
      </label>
      <label>
        到岗日期（未确认可留空）
        <input
          value={value.profile.arrival_date ?? ''}
          onChange={(e) =>
            setValue({
              ...value,
              profile: { ...value.profile, arrival_date: e.target.value || null },
            })
          }
        />
      </label>
      <label>
        目标岗位关键词
        <input
          aria-label="目标岗位"
          value={value.preferences.keywords.join(',')}
          onChange={(e) =>
            setValue({
              ...value,
              preferences: { ...value.preferences, keywords: list(e.target.value) },
            })
          }
        />
      </label>
      <label>
        城市（留空不限）
        <input
          value={value.preferences.cities.join(',')}
          onChange={(e) =>
            setValue({
              ...value,
              preferences: { ...value.preferences, cities: list(e.target.value) },
            })
          }
        />
      </label>
      <label>
        接受的经验要求上限（月）
        <input
          type="number"
          min={0}
          max={120}
          value={value.preferences.max_experience_months}
          onChange={(e) =>
            setValue({
              ...value,
              preferences: {
                ...value.preferences,
                max_experience_months: Number(e.target.value),
              },
            })
          }
        />
      </label>
      <label>
        排除公司
        <input
          value={value.preferences.blacklist.join(',')}
          onChange={(e) =>
            setValue({
              ...value,
              preferences: { ...value.preferences, blacklist: list(e.target.value) },
            })
          }
        />
      </label>
      <label>
        工作类型
        <select
          value={
            value.preferences.employment.length === 2
              ? 'both'
              : (value.preferences.employment[0] ?? 'both')
          }
          onChange={(e) =>
            setValue({
              ...value,
              preferences: {
                ...value.preferences,
                employment:
                  e.target.value === 'both'
                    ? ['internship', 'full_time']
                    : [e.target.value as 'internship' | 'full_time'],
              },
            })
          }
        >
          <option value="both">实习、正式都可以</option>
          <option value="internship">只看实习</option>
          <option value="full_time">只看正式工作</option>
        </select>
      </label>
      <label>
        最低月薪（元，0 表示不限）
        <input
          type="number"
          min={0}
          value={value.preferences.minimum_monthly_salary}
          onChange={(e) =>
            setValue({
              ...value,
              preferences: {
                ...value.preferences,
                minimum_monthly_salary: Number(e.target.value),
              },
            })
          }
        />
      </label>
      <label>
        每日最多沟通数
        <input
          type="number"
          min={1}
          max={20}
          value={value.preferences.daily_limit}
          onChange={(e) =>
            setValue({
              ...value,
              preferences: { ...value.preferences, daily_limit: Number(e.target.value) },
            })
          }
        />
      </label>
      <label>
        沟通间隔（秒）
        <input
          type="number"
          min={0}
          max={3600}
          value={value.preferences.interval_seconds}
          onChange={(e) =>
            setValue({
              ...value,
              preferences: {
                ...value.preferences,
                interval_seconds: Number(e.target.value),
              },
            })
          }
        />
      </label>
      <label>
        分析方式
        <select
          aria-label="分析方式"
          value={value.analysis_mode}
          onChange={(e) =>
            setValue({ ...value, analysis_mode: e.target.value as 'rules' | 'llm' })
          }
        >
          <option value="rules">规则初筛（无需模型）</option>
          <option value="llm">模型分析（需本地配置）</option>
        </select>
      </label>
      <button
        className="test-button"
        disabled={busy}
        type="submit"
      >
        保存求职资料
      </button>
    </form>
  );
}
