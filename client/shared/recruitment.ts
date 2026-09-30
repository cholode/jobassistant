// 招聘业务共享类型：对应 Python 返回的数据，供主进程和界面使用。

export interface RecruitmentConfig {
  // 个人事实用于生成消息；偏好用于筛选和限制执行频率，不存放模型密钥。
  profile: {
    name: string;
    skills: string[];
    facts: string[];
    days_per_week: number | null;
    months: number | null;
    arrival_date: string | null;
  };
  preferences: {
    keywords: string[];
    cities: string[];
    max_experience_months: number;
    employment: ('internship' | 'full_time')[];
    blacklist: string[];
    minimum_monthly_salary: number;
    daily_limit: number;
    interval_seconds: number;
  };
  analysis_mode: 'rules' | 'llm';
}
export interface JobRecord {
  // 页面只消费展示所需字段，完整岗位和事实索引保存在后端。
  job: {
    id: string;
    title: string;
    company: string;
    salary: string;
    location: string;
    url: string;
    platform: string;
    detail_complete: boolean;
  };
  analysis: {
    decision: 'apply' | 'skip' | 'review';
    match_score: number;
    strengths: string[];
    concerns: string[];
    reason: string;
    source: string;
  };
}
export interface ApplicationRecord {
  // message 为审批使用的文本；status 决定可否继续确认，error 用于人工核对。
  id: string;
  job_id: string;
  title: string;
  company: string;
  message: string;
  status: string;
  error: string;
  resume_policy: string;
}
export interface RecruitmentState {
  config: RecruitmentConfig;
  jobs: JobRecord[];
  applications: ApplicationRecord[];
  events: { kind: string; subject: string; time: string }[];
  model_configured: boolean;
}
export type RecruitmentAction = 'state' | 'config' | 'discover' | 'prepare' | 'approve';
