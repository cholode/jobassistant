# Job Agent Desktop

Windows 本地求职工作台，使用 Electron 内嵌招聘网页、React 显示侧边面板、Python FastAPI 管理状态和浏览器读取请求。

目前完成 Phase 1–4 的模拟站闭环：手动浏览、网页缩放、浏览器 RPC、岗位筛选与分析、LangGraph 人工确认投递、SQLite 持久化。默认 Manual；切换 Copilot 并恢复后，仍需逐次确认才会沟通。真实 BOSS 投递适配器尚未启用。

## 环境与安装

- Windows 10/11 x64
- Node.js 22.12+、pnpm（项目指定版本见 `client/package.json`）
- Python 3.12、uv

在项目根目录运行：

```powershell
uv sync --project backend --locked
pnpm.cmd --dir client install --frozen-lockfile
```

依赖分别安装到 `backend/.venv` 和 `client/node_modules`。

## 启动与使用

```powershell
# 开发模式，界面支持 Vite 热更新
powershell -ExecutionPolicy Bypass -File scripts/dev.ps1

# 使用构建后的界面
powershell -ExecutionPolicy Bypass -File scripts/dev.ps1 -Built
```

脚本构建客户端，启动后端，等待健康检查，再打开 Electron。请保留终端；关闭桌面窗口后脚本清理服务。开发模式需空闲的 8765、5173 端口。修改 Electron 主进程或 Python 代码后需重启。

1. 点击“模拟招聘站”，手动打开职位详情或模拟聊天。
2. 地址栏右侧使用 `− / 百分比 / +` 缩放网页，范围 50%～200%；点击百分比恢复 100%。网页聚焦时支持 Ctrl 加号、减号、0 和 Ctrl+滚轮。工作台本身不缩放。
3. 右侧点击“读取当前页面”，查看已加载的职位信息、聊天消息或正文。Agent 暂停时也可手动读取。
4. 跳转、刷新和断线后，旧读取结果会清空；失败时可重试。

5. 打开“个人资料”，填写技能、简历事实和求职规则并保存。默认规则模式无需模型 Key。
6. 在“岗位”面板分析列表，打开 Go 实习岗位详情并重新分析，查看匹配点和待补充项。
7. 生成确认卡，检查或编辑招呼语，切换 Copilot、恢复 Agent，再确认沟通。应用先点击沟通，再补发针对岗位的消息，最后停在等待回复。

模拟站消息保存在网页 localStorage，不会发送给真实公司。当前没有简历附件发送功能。

真实招聘站当前仅支持通用可见正文读取。专用职位字段和 HR 消息适配尚未验证，暂不提供结构化解析；不会猜测真实网站选择器。读取不涵盖尚未加载、跨域 iframe 或图片中的内容。遇到识别出的验证提示会暂停，由用户手动完成验证。

Phase 3–4 的实现、配置与边界见 [岗位分析与投递工作流](docs/phase3-4.md)。

## 目录与职责

```text
client/
  electron/
    main.ts                   窗口创建、通信连接和模块组装
    preload.cts               工作台受限 IPC 桥接
    browser/                  浏览器控制器、语义命令分发、Python RPC 桥接
    platforms/                通用读取与模拟平台适配器，DOM 细节仅在此层
  shared/                     状态和 Browser RPC 的 TypeScript 类型
  src/
    App.tsx                   页面布局与组件组装
    components/browser/       浏览区域、地址栏与缩放控件
    components/agent/         Agent 面板、页面读取结果
    components/layout/        侧边导航
    components/jobs/          资料表单、岗位分析、投递确认卡
    hooks/                    状态订阅、读取流程、原生视图尺寸同步
    stores/                   Zustand 状态存储
  tests/                      桌面集成和 RPC 边界测试
backend/
  app/
    main.py                   应用工厂及薄接口入口
    models.py                 Agent 指令和页面状态模型
    browser/                  RPC 协议、请求关联、超时与断线处理
    api/                      招聘 HTTP 接口
    jobs/                     岗位模型、字段解析、硬规则
    agents/                   规则与模型分析、基于事实的招呼语
    graphs/                   发现与投递 LangGraph 工作流
    database/                 SQLite 资料、岗位、投递及事件存储
    services/
      agent.py                Agent 状态与指令处理
      websocket.py            连接认证、消息分流及收发
      browser.py              页面读取服务、HTTP 认证及错误映射
      recruitment.py          确认绑定、执行校验、限额与状态恢复
  desktop_entry.py            发布版后端入口
  tests/                      HTTP、WebSocket、RPC 与状态隔离测试
mock-site/                    本地模拟招聘站
scripts/                      启动、检查和打包脚本
release/                      按版本归档的本地 EXE（忽略 Git）
```

## 通信架构

```text
React 读取按钮 → preload IPC → Electron RPC Bridge
    → Python POST /browser/read → BrowserRPCClient
    → WebSocket browser_command → Electron BrowserController + Platform Adapter
    → browser_result → Python 校验 → HTTP 响应 → React 结果面板
```

Python 只发送语义命令，不持有 WebContents，不发送 CSS 选择器或任意脚本。详情见 [Browser RPC 文档](docs/browser-rpc.md)。

## 测试

执行：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/test.ps1
```

包含 Python lint / pytest、TypeScript 检查、前端构建、RPC 边界测试、真实 Electron + 模拟站集成测试。桌面测试使用随机本地端口、独立用户目录和数据库，不使用个人招聘网站登录会话，截图和测试数据保存在忽略提交的 `logs/` 下。

## 后端单独运行

开发脚本会自动完成以下步骤；只有单独调试时才需要手动执行：

```powershell
$env:JOB_AGENT_TOKEN = [guid]::NewGuid().ToString('N')
cd backend
uv run uvicorn app.main:create_app --factory --host 127.0.0.1 --port 8765
```

单独启动的客户端必须使用同一令牌。`GET /health` 无需认证，其他 HTTP 接口通过 `X-Job-Agent-Token` 认证；WebSocket 用第一帧令牌认证。

## 配置与数据

默认规则模式无需模型 API Key，也无需 MCP 服务。可复制 `backend/.env.example` 为 `backend/.env`，配置 `OPENAI_API_KEY`、`JOB_AGENT_MODEL` 及可选的 `OPENAI_BASE_URL`，重启后在个人资料选择模型分析。模型模式会把岗位和填写的个人材料发送给配置的模型服务；当前自动化测试未调用真实模型。

外部网页使用独立、持久化的沙箱会话；没有 Node.js、Python 或工作台 IPC 权限。写入仅开放经过确认的语义操作，底层点击、填写接口不直接暴露给模型或 HTTP。Manual／暂停会阻止自动写入。

开发数据保存在 `private/recruitment.db` 与 `private/workflow.db`；打包后保存在 Electron 用户数据目录的 `data/`。可通过 `JOB_AGENT_DATA_DIR` 覆盖。首次初始化可读取同目录 `profile.json`，之后通过界面修改资料。投递正文和简历事实属于本地持久化数据。

`.env`、依赖、日志、浏览器登录数据和构建产物不提交到 Git。个人简历请放在已忽略的 `resumes/` 或 `private/` 中。

## 打包

```powershell
uv pip install --python backend/.venv/Scripts/python.exe pyinstaller
powershell -ExecutionPolicy Bypass -File scripts/release.ps1 -Version 0.0.1
```

生成 `release/v0.0.1/Job-Agent-0.0.1-win-x64.exe`，包含 Python 后端，无需目标机器安装开发环境。修改源码不会自动更新已有 EXE，需要重新打包。更多说明见 [发布目录说明](release/README.md)。
