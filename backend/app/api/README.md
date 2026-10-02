# 招聘 HTTP API

`recruitment_router(service) -> APIRouter` 注册下列接口，前缀 `/recruitment`，具体操作委托 [RecruitmentService](../services/README.md)。所有接口要求请求头 `X-Job-Agent-Token`。

| 方法与路径 | JSON 输入 | 成功返回 |
| --- | --- | --- |
| `GET /recruitment/state` | 无 | `{config, jobs, applications, events, model_configured}` |
| `PUT /recruitment/config` | RecruitmentConfig | 保存后的完整招聘状态 |
| `POST /recruitment/discover` | 无必需请求体 | 本轮分析记录数组，每项 `{job, analysis, updated_at}` |
| `POST /recruitment/prepare` | `{"job_id":"领域岗位 ID"}` | 一条投递记录，通常为 `WAITING_USER_CONFIRMATION` |
| `POST /recruitment/applications/{key}/approve` | `{"approved":true,"message":"可选最终文本"}` | 当前投递记录；拒绝使用 `approved:false` |

`key` 是投递记录 ID，不是岗位 ID。`message` 可省略或为 null，表示保留已有文本；非 null 时长度为 1–1500，批准时还会 trim 并拒绝空白。模型约束详见 [jobs](../jobs/README.md)。配置接口保存整个配置模型，不是局部补丁；省略字段会使用模型默认值。

## 返回记录

岗位记录的 `job` 是 Job，`analysis` 是 JobDecision。投递记录包含 `id/operation_id/job_id/company/title/job/profile_hash/message/status/created_at/error/resume_policy`，持久化返回可含 `updated_at`，执行中增加 `contact_attempt_at/sent_at`。事件项为 `{kind, subject, details, time}`；状态接口最多返回读取结果末尾 100 条事件。`model_configured` 仅检查配置变量是否存在，不验证模型服务连通性。

## 错误与执行前提

| HTTP 状态 | 情况 |
| --- | --- |
| 401 | 缺少或错误令牌 |
| 422 | 请求字段不符合 Pydantic 模型 |
| 404 | 未分析的岗位或不存在的投递记录 |
| 400 | 发现失败、详情不完整、硬规则排除、没有简历事实、空消息等 |
| 409 | 批准时尚未 Copilot + running，或确认卡绑定的配置已变化 |

HTTP 错误正文为 `{"detail":...}`。图恢复期间失败通常被保存为投递记录的 `ERROR` 或 `UNCERTAIN`，仍以成功 HTTP 响应返回记录，因此必须检查 `status/error`。未被服务捕获的异常仍可能成为服务器错误。

`prepare` 只生成审批卡并停在人工中断点。`approve(true)` 才可能触发网页写入，当前仅支持模拟站。非待审批记录再次 approve 只返回现有记录，不重复执行。结果不确定时不能自动重发。

## 调用示例

以下命令在后端运行且当前 PowerShell 已设置相同令牌时使用：

```powershell
$headers = @{ 'X-Job-Agent-Token' = $env:JOB_AGENT_TOKEN }
Invoke-RestMethod 'http://127.0.0.1:8765/recruitment/state' -Headers $headers
Invoke-RestMethod 'http://127.0.0.1:8765/recruitment/discover' -Method Post -Headers $headers
```

发现操作读取桌面当前已加载页面，需先连接 Electron；不会自动翻页。前端调用入口见 [招聘 IPC](../../../client/electron/ipc/README.md)。
