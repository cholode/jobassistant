# 目录接口文档索引

接口文档依据当前源码，按目录就近维护。这里的“接口”包括 HTTP/WebSocket、IPC/RPC、Python 类与函数、TypeScript 类型、React Props/Hook 和脚本输入输出。没有运行时接口的目录说明其文件与使用契约。

## 后端

| 目录 | 文档内容 |
| --- | --- |
| [backend](../backend/README.md) | 启动、配置、发布入口 |
| [app](../backend/app/README.md) | 应用工厂、基础 HTTP/WS、ClientMessage |
| [api](../backend/app/api/README.md) | 招聘 HTTP 参数、响应、错误和示例 |
| [services](../backend/app/services/README.md) | Agent 状态、连接、读取和招聘用例 |
| [browser](../backend/app/browser/README.md) | RPC 模型、超时和请求关联 |
| [jobs](../backend/app/jobs/README.md) | 领域模型、解析与硬规则 |
| [agents](../backend/app/agents/README.md) | 上下文、规划、工具、记忆与反思 |
| [graphs](../backend/app/graphs/README.md) | 发现、人工中断与投递图 |
| [database](../backend/app/database/README.md) | 仓库读写和异常恢复 |
| [tests](../backend/tests/README.md) | 后端验证入口 |

## 客户端

| 目录 | 文档内容 |
| --- | --- |
| [client](../client/README.md) | 构建与运行命令 |
| [shared](../client/shared/README.md) | DesktopAPI 和跨进程类型 |
| [electron](../client/electron/README.md) | 主进程配置、preload、IPC 通道 |
| [browser](../client/electron/browser/README.md) | 浏览器控制器、读写语义分发 |
| [ipc](../client/electron/ipc/README.md) | 招聘 action/payload 到 HTTP 的映射 |
| [platforms](../client/electron/platforms/README.md) | 适配器抽象与通用读取 |
| [mock](../client/electron/platforms/mock/README.md) | 模拟站读取、写入与回执 |
| [src](../client/src/README.md) | React 入口与数据方向 |
| [components](../client/src/components/README.md) | 组件总览 |
| [agent](../client/src/components/agent/README.md) | AgentPanel、PageReader |
| [browser](../client/src/components/browser/README.md) | BrowserPane、BrowserToolbar |
| [jobs](../client/src/components/jobs/README.md) | 资料、岗位和审批组件 |
| [layout](../client/src/components/layout/README.md) | Sidebar 导航回调 |
| [hooks](../client/src/hooks/README.md) | 订阅、读取、动作与尺寸同步 |
| [stores](../client/src/stores/README.md) | Zustand 快照状态 |
| [tests](../client/tests/README.md) | 桌面、RPC 与发布测试 |

## 支持目录与设计说明

- [模拟站](../mock-site/README.md)：hash 路由、localStorage 和 DOM 契约。
- [脚本](../scripts/README.md)：启动、检查、测试、打包输入输出。
- [发布归档](../release/README.md)：二进制产物和运行环境约定。
- [Browser RPC 设计](browser-rpc.md)：读取链路与边界。
- [Agent 架构](agent-architecture.md)：内核拆分与扩展设计。
- [岗位分析与投递](phase3-4.md)：业务流程和阶段能力。

docs 本身不注册运行时接口。新增模块时为目录建立 README，并同步本索引；修改参数、返回值、错误码、状态流转或副作用时同步对应文档。以源码实现为准，不将后续规划写作已开放能力。node_modules、.venv、缓存、logs、private、构建目录和版本二进制子目录不逐个生成接口文档。
