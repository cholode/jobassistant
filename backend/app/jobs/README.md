# 岗位领域接口

本目录定义跨服务传递的数据以及确定性的解析、过滤函数，不访问网页或数据库。

## models.py

| 模型 | 输入/输出字段及默认值 |
| --- | --- |
| Profile | name=""；skills 默认 Go/MySQL/Redis；facts=[]；days_per_week/months/arrival_date 默认 null |
| Preferences | keywords 默认 Go/Golang；cities/blacklist=[]；max_experience_months=12；employment 默认 internship/full_time；minimum_monthly_salary=0；daily_limit=3；interval_seconds=30 |
| RecruitmentConfig | profile=Profile()、preferences=Preferences()、analysis_mode=rules，可改 llm |
| Job | id/platform/source_id/url/title/company/location/salary/description/tags/fingerprint；可空经验月数、最低月薪；employment=unknown；detail_complete=false |
| JobDecision | decision=apply/skip/review；match_score 0–100；strengths/concerns/reason；source 默认 rules，可为 llm；matched_skills/evidence_ids 默认 [] |
| Approval | 必填 approved: bool；message 可空，非空值长度 1–1500 |

Profile、Preferences、RecruitmentConfig 和 Approval 拒绝额外字段。skills 最多 50 项、facts 最多 30 项，每项最多 1500 字符，清理空白并去重。days_per_week 范围 1–7，months 范围 1–36。经验单位是月；最低薪资单位是元/月；daily_limit 范围 1–20，interval_seconds 范围 0–3600。evidence_ids 是当前 Profile.facts 的零基索引，不是数据库 ID。校验失败抛 Pydantic ValidationError。

## parser.py / rules.py

| 接口 | 参数 → 返回 | 约定 |
| --- | --- | --- |
| `fingerprint(value)` | JSON 可序列化对象 → SHA-256 十六进制字符串 | 按键排序；不可序列化对象会失败 |
| `parse_job(summary, platform, detail)` | JobSummary、平台名、详情标志 → Job | 解析经验、薪资和类型；未知数值保留 None |
| `contains(text, keyword)` | 两字符串 → bool | Go 使用词边界及 golang/go语言匹配，其他关键词忽略大小写 |
| `hard_filter(job, preference)` | Job、Preferences → list[str] | 返回已知不符合项；空数组不代表未知要求已满足 |

模拟岗位 ID 基于 `mock:<source_id>` 摘要，忽略本地端口变化；其他平台使用 hostname/path/fragment。内容指纹排除 URL。detail_complete 要求 detail=true 且 description 非空。日薪不会推算为月薪。

```python
from app.jobs.models import RecruitmentConfig
from app.jobs.parser import parse_job
from app.jobs.rules import hard_filter

job = parse_job(summary, platform="mock", detail=True)  # summary 为 JobSummary
reasons = hard_filter(job, RecruitmentConfig().preferences)
```

调用者：[Agent 分析](../agents/README.md)、[发现图](../graphs/README.md)、[招聘服务](../services/README.md)。
