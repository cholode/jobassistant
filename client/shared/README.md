# 跨进程数据与 DesktopAPI

本目录只提供 TypeScript 类型，没有网络或存储副作用。Python 对应模型见 [app](../../backend/app/README.md)、[browser](../../backend/app/browser/README.md) 和 [jobs](../../backend/app/jobs/README.md)。类型声明不替代运行时参数校验。

## protocol.ts

| 类型 | 字段 |
| --- | --- |
| PageState | home?、zoom、url、title、loading、canBack、canForward；zoom 是倍率 |
| AgentState | status=paused/running、mode=manual/copilot、revision、page:{url,title} |
| LogEntry | id、time、text、kind=info/success/warning |
| Snapshot | connected、agent、browser、logs、latency（毫秒或 null） |

前端 PageState 包含浏览器 UI 状态，与后端只有 URL/title 的 PageState 不是同一形状。

`window.desktop: DesktopAPI` 由 [preload](../electron/README.md) 提供：

| 方法 | 参数 | 返回 |
| --- | --- | --- |
| snapshot | 无 | Promise<Snapshot> |
| subscribe | `(state: Snapshot) => void` | 取消订阅函数 `() => void` |
| navigate | URL 字符串 | Promise<void> |
| browserZoom | in/out/reset | Promise<void> |
| browserAction | back/forward/reload/home | Promise<void> |
| bounds | `{x,y,width,height}`，CSS 像素 | Promise<void> |
| agentAction | pause/resume/ping/copilot/manual | Promise<void> |
| readPage | 无 | Promise<PageReading> |
| recruitment | RecruitmentAction、可选 payload | Promise<unknown>，按动作解释结果 |

除 subscribe 外均为 IPC 异步调用，失败 reject；订阅方卸载时必须取消订阅。bounds 数值必须有限，主进程四舍五入并裁剪至窗口。navigate 受域名白名单限制。

## browser.ts

BrowserCommandName 仅为 GET_PAGE_DATA/GET_JOB_DETAIL/GET_CHAT_MESSAGES。BrowserCommand 包含 type=browser_command、request_id、command、payload:{expected_url:string|null}。BrowserResult 是 success 判别联合，成功为 data，失败为 error:{code,message}。

PageReading 含 url/title/platform/kind/text/truncated/read_at/jobs/messages/notice 和可选 operation:{operation_id,action}。JobSummary 为适配器抽取的原始岗位，ChatMessage.sender 为 hr/me/unknown。写入命令不在 BrowserCommandName 中，桥接层按独立载荷分流。

## recruitment.ts

RecruitmentConfig 包含 profile、preferences、analysis_mode；Profile 的 facts 是用户原始事实，空时间用 null。JobRecord 是展示所需的 job/analysis 子集；ApplicationRecord 包含 id/job_id/title/company/message/status/error/resume_policy；RecruitmentState 包含 config/jobs/applications/events/model_configured。这些展示类型不列出后端所有持久化字段。

RecruitmentAction 为 state/config/discover/prepare/approve，payload 和结果见 [IPC 映射](../electron/ipc/README.md)。审批是否成功需要读取 ApplicationRecord.status，而不只看 Promise 是否 resolve。
