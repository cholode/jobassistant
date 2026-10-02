# 后端接口

FastAPI 后端负责状态、岗位分析、审批流程和持久化；浏览器实际操作由 Electron 完成。

## 启动入口

在项目根目录运行开发脚本，或设置 `JOB_AGENT_TOKEN` 后执行：

```powershell
uv run --project backend uvicorn app.main:create_app --factory --host 127.0.0.1 --port 8765
```

`desktop_entry.py` 供发布版调用：绑定 `127.0.0.1` 随机端口，在 stdout 输出 `JOB_AGENT_PORT=<端口>`，随后启动服务。打包模式从内置资源定位模拟站。

## 配置契约

| 输入 | 作用 |
| --- | --- |
| `JOB_AGENT_TOKEN` | 应用令牌；未传构造参数且没有此变量时启动失败 |
| `JOB_AGENT_DATA_DIR` | 业务数据、图检查点和 Agent 记忆目录，默认根目录 `private/` |
| `JOB_AGENT_MOCK_DIR` | 静态模拟站目录覆盖 |
| `OPENAI_API_KEY`、`JOB_AGENT_MODEL` | 模型分析模式必需；规则模式不需要 |
| `OPENAI_BASE_URL` | 可选模型服务地址 |

应用工厂加载 `backend/.env`，不覆盖已有环境变量。数据库分别为 `recruitment.db`、`workflow.db`、`agent-memory.db`。HTTP 使用 `X-Job-Agent-Token`；WebSocket 使用第一帧认证。

## 模块入口

- [应用组装与基础协议](app/README.md)
- [招聘 HTTP API](app/api/README.md)
- [业务服务](app/services/README.md)
- [浏览器 RPC](app/browser/README.md)
- [岗位模型与规则](app/jobs/README.md)
- [Agent 内核](app/agents/README.md)
- [工作流](app/graphs/README.md)
- [数据访问](app/database/README.md)
- [测试接口](tests/README.md)

完整项目入口见 [根文档](../README.md)，接口导航见 [文档索引](../docs/README.md)。
