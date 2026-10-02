# 后端测试接口

本目录以 pytest 校验后端公开行为，不提供业务 API。conftest.py 提供测试环境辅助，测试数据使用隔离目录，模型测试使用替身。

| 文件 | 主要覆盖边界 |
| --- | --- |
| test_phase1.py | 健康检查、认证、Agent 指令、WebSocket 与实例隔离 |
| test_browser_rpc.py | RPC 关联、断线/超时、浏览器读取与输入边界 |
| test_recruitment.py | 岗位解析、规则、审批、重复操作与恢复 |
| test_agent_runtime.py | 上下文、记忆、工具注册、执行和反思 |

在根目录运行：

```powershell
uv run --project backend --locked pytest backend/tests -q
uv run --project backend --locked ruff check backend/app backend/tests
```

成功退出码为 0，失败输出断言或 lint 位置。完整桌面链路用 [scripts/test.ps1](../../scripts/README.md)。新增接口测试优先验证输入、输出、错误及副作用边界，模型替身通过不表示真实模型服务已验证。
