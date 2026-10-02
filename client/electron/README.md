# Electron 主进程与 preload 接口

main.ts 组装 BrowserWindow、独立 WebContentsView、RPC 桥、招聘 IPC 和后端 WebSocket。preload.cts 将受限 DesktopAPI 暴露为 window.desktop；它只加载在工作台页面。

## 配置与生命周期

开发时读取 JOB_AGENT_TOKEN，与后端一致；JOB_AGENT_BACKEND_URL 仅接受 `http://127.0.0.1:<端口>`，默认 8765。JOB_AGENT_DEV_URL 仅在值为 `http://127.0.0.1:5173` 时用于开发页面。JOB_AGENT_USER_DATA 可覆盖 Electron 用户目录。

发布时主进程生成令牌、启动内置后端，解析 stdout 的 JOB_AGENT_PORT 后连接；退出时结束子进程。断线时清理请求并暂停，重连后不自动恢复执行。运行日志保留最近 80 条。

## IPC 通道

| 通道 | 输入 | 输出 |
| --- | --- | --- |
| desktop:snapshot | 无 | Snapshot |
| desktop:state | 主进程推送 | 完整 Snapshot，preload.subscribe 接收 |
| browser:read | 无 | PageReading，经后端 HTTP→WS RPC |
| browser:navigate | URL | 完成或错误 |
| browser:action | back/forward/reload/home | 完成或错误 |
| browser:zoom | in/out/reset | 完成或错误；范围 0.5–2 |
| browser:bounds | `{x,y,width,height}` | 更新原生视图位置 |
| agent:action | pause/resume/ping/manual/copilot | 等待后端对应响应 |
| recruitment:request | action、payload | 招聘 HTTP 结果 |

处理器只接受工作台自身主框架，其他 sender/frame 抛 Untrusted IPC sender。普通工作台导航属于用户操作，不要求 Copilot；底层自动控制器的写方法另行检查 canWrite。pause/manual/copilot 动作先在本地标记 paused，再发后端请求。

URL 白名单为同源 `/mock/` 以及指定 HTTPS 域名 www.zhipin.com、www.liepin.com、www.zhaopin.com、www.nowcoder.com；拒绝内嵌账号密码及不支持的端口。

完整方法签名见 [DesktopAPI](../shared/README.md)，实现分层见 [browser](browser/README.md)、[ipc](ipc/README.md)、[platforms](platforms/README.md)。
