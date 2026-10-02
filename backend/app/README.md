# 应用组装与基础接口

## 应用工厂

`main.create_app(token: str | None = None, data_dir: Path | None = None) -> FastAPI` 为每个应用创建独立的 AgentService、BrowserRPCClient、WebSocketService、BrowserService 和 RecruitmentService。`data_dir` 覆盖招聘服务数据目录。生命周期进入时执行 `recruitment.start()`，退出时执行 `close()`。

| 接口 | 输入 | 输出与行为 |
| --- | --- | --- |
| `GET /health` | 无认证 | `{status: "ok", service: "job-agent", phase: 4}` |
| `GET /agent/state` | 令牌请求头 | `{status, mode, page, revision}`；认证失败 401 |
| `POST /browser/read` | 令牌、BrowserReadRequest JSON | PageReading；见 [RPC 协议](browser/README.md) |
| `WS /ws` | 首帧令牌、后续 ClientMessage 或 BrowserResult | 连接事件、状态事件、心跳和浏览器命令 |
| `/recruitment/*` | 令牌和业务参数 | 见 [招聘 API](api/README.md) |
| `/mock/*` | 静态资源路径 | 本地模拟站 HTML/JS/CSS |

## models.py 数据契约

`PageState`：`url: str = ""`（最多 4096 字符）、`title: str = ""`（最多 512 字符）。只记录地址和标题，不是 DOM 或职位正文。

`ClientMessage`：`type` 为 `pause/resume/start/page/ping/copilot/manual` 之一；必填 `request_id: str` 最多 100 字符；可选 `page: PageState | None`。`start/resume` 在服务层要求携带 page。

## WebSocket 示例

```json
{"token":"与后端一致的令牌"}
```

认证通过后服务发送 `connected`。随后可发送：

```json
{"type":"resume","request_id":"req-1","page":{"url":"http://127.0.0.1:8765/mock/","title":"模拟站"}}
```

正常响应包含 `type`、`request_id`、`state`、UTC ISO 时间 `time`。普通指令返回 `agent_state`，心跳返回 `pong`；校验失败返回 `error`。连接层拒绝带 Origin 的连接；5 秒内须完成首帧认证，同一后端只接受一个已认证桌面连接。

调用方向：HTTP/WS → [services](services/README.md) → 领域模型、Agent、工作流和 RPC。路由层不直接操作数据库或网页。
