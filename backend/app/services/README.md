# 业务服务接口

本目录接收路由和 WebSocket 请求，管理认证、共享状态以及用例执行。由 [应用工厂](../README.md) 注入依赖。

## agent.py — AgentService

`AgentService(token: str | None = None)` 使用显式令牌或 `JOB_AGENT_TOKEN`；缺失抛 RuntimeError。每个实例的内存初态是 `paused/manual`、空 PageState、`revision=0`。

| 方法 | 参数 → 返回 | 行为 |
| --- | --- | --- |
| `health()` | 无 → dict | 无认证健康状态 |
| `valid_token(value)` | 可空字符串 → bool | 常量时间令牌比较 |
| `get_state(token)` | 令牌 → dict | 无效令牌抛 HTTPException(401)；返回内部状态对象 |
| `event(kind, request_id=None)` | 事件名、请求 ID → dict | type/request_id/state/time；state 为浅复制 |
| `handle_message(message)` | ClientMessage → dict | 更新状态并返回事件，不负责网络发送 |
| `pause_on_disconnect()` | 无 → None | 暂停并递增 revision |

`manual/copilot` 切换模式并暂停；`start/resume` 必须带 page，否则返回 error 且不改变状态；`pause` 暂停。携带 page 时更新页面。非 ping 成功指令递增 revision；ping 返回 pong 且不递增。此类不调用模型，也不执行投递。

## websocket.py — WebSocketService

`WebSocketService(agent, rpc)`；`await handle(ws: WebSocket) -> None` 管理首帧认证、单客户端登记、接收与断开清理。连接锁串行处理控制指令；`browser_result` 直接交 `rpc.receive`，其他消息校验为 ClientMessage。无效消息返回 error；已登记连接断开时解除 RPC 并暂停 Agent。拒绝带 Origin、非法认证以及重复客户端，关闭码 1008。

## browser.py — BrowserService

`BrowserService(agent, rpc)`；`await read(token, request: BrowserReadRequest) -> PageReading` 认证后请求 RPC。返回 verification 页面时暂停 Agent 并发送状态事件。RPC 错误映射：DISCONNECTED→503、TIMEOUT→504、BUSY→429，其余→502；detail 为 `{code, message}`。手动读取不要求 Agent running。

## recruitment.py — RecruitmentService

`RecruitmentService(agent, rpc, directory: Path | None = None)` 组装仓库、JobAgent 和发现图；目录优先级是参数、环境变量、默认 private。先 `await start()` 再调用审批流程，结束时 `await close()` 释放连接。

| 方法 | 输入 → 输出 |
| --- | --- |
| `authorize(token)` | 令牌 → None；无效时 401 |
| `state(token)` | 令牌 → 完整招聘状态 |
| `await configure(token, config)` | RecruitmentConfig → 保存后的状态 |
| `await discover(token)` | 令牌 → 本轮岗位记录数组 |
| `await prepare(token, job_id)` | 领域岗位 ID → 投递确认记录 |
| `await approve(token, key, approval)` | 投递 ID、Approval → 当前记录 |
| `running()` | 无 → None；非 running/copilot 抛 ValueError |
| `set_status(key, status, **extra)` | 投递 ID、状态和补充字段 → 保存后的记录并写事件 |
| `payload(key)` | 投递 ID → 六字段网页操作载荷 |
| `await verify_application(key)` | 投递 ID → None；复核页面、规则、限额后置 APPROVED |
| `await contact(key)` | 投递 ID → None；先记录尝试，再 CONTACT_HR，核对回执 |
| `await send_greeting(key)` | 投递 ID → None；SEND_GREETING 后核对己方消息，置 WAITING_REPLY |

业务修改由服务锁串行处理。审批卡绑定岗位快照和完整配置指纹；执行前要求当前模拟岗位与确认卡一致。每日次数按 UTC 日期计算，间隔按秒计算。写入前再次核验运行状态；点击或发送后无可靠回执标记 UNCERTAIN。

HTTP 形状、状态码和调用示例见 [API](../api/README.md)；图顺序见 [graphs](../graphs/README.md)；载荷见 [模拟适配器](../../../client/electron/platforms/mock/README.md)。
