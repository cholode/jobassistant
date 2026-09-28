# Job Agent Desktop

Windows 本地求职工作台，使用 Electron 内嵌招聘网页、React 显示侧边面板、Python FastAPI 管理状态和浏览器读取请求。

目前完成 Phase 1、Phase 2：手动浏览、网页缩放、暂停／恢复、BrowserController、Browser RPC 和平台适配层。当前为 Manual 模式，不会自动投递、联系 HR 或发送消息，也不调用大模型。

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

模拟站的消息只保存在网页内存中，刷新即清空，不会发送给真实公司。

真实招聘站当前仅支持通用可见正文读取。专用职位字段和 HR 消息适配尚未验证，暂不提供结构化解析；不会猜测真实网站选择器。读取不涵盖尚未加载、跨域 iframe 或图片中的内容。遇到识别出的验证提示会暂停，由用户手动完成验证。

当前没有岗位匹配分、AI 建议、自动投递和持久化任务，这些属于后续阶段。

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
    hooks/                    状态订阅、读取流程、原生视图尺寸同步
    stores/                   Zustand 状态存储
  tests/                      桌面集成和 RPC 边界测试
backend/
  app/
    main.py                   应用工厂及薄接口入口
    models.py                 Agent 指令和页面状态模型
    browser/                  RPC 协议、请求关联、超时与断线处理
    services/
      agent.py                Agent 状态与指令处理
      websocket.py            连接认证、消息分流及收发
      browser.py              页面读取服务、HTTP 认证及错误映射
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

先关闭使用开发端口的应用，然后执行：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/test.ps1
```

包含 Python lint / pytest、TypeScript 检查、前端构建、RPC 边界测试、真实 Electron + 模拟站集成测试。桌面测试使用独立用户目录，不使用个人招聘网站登录会话，截图和测试数据保存在忽略提交的 `logs/` 下。

## 后端单独运行

开发脚本会自动完成以下步骤；只有单独调试时才需要手动执行：

```powershell
$env:JOB_AGENT_TOKEN = [guid]::NewGuid().ToString('N')
cd backend
uv run uvicorn app.main:create_app --factory --host 127.0.0.1 --port 8765
```

单独启动的客户端必须使用同一令牌。`GET /health` 无需认证，其他 HTTP 接口通过 `X-Job-Agent-Token` 认证；WebSocket 用第一帧令牌认证。

## 配置与数据

Phase 2 无需模型 API Key，也无需 MCP 服务。后续模型配置尚未接入，当前填写 Key 不会启用 AI。

外部网页使用独立、持久化的沙箱会话；没有 Node.js、Python 或工作台 IPC 权限。读取结果仅在内存中显示，日志不写入正文或令牌。RPC 仅开放读取；底层点击、填写、自动导航接口在 Manual 模式被拒绝。

`.env`、依赖、日志、浏览器登录数据和构建产物不提交到 Git。个人简历请放在已忽略的 `resumes/` 或 `private/` 中。

## 打包

```powershell
uv pip install --python backend/.venv/Scripts/python.exe pyinstaller
powershell -ExecutionPolicy Bypass -File scripts/release.ps1 -Version 0.0.1
```

生成 `release/v0.0.1/Job-Agent-0.0.1-win-x64.exe`，包含 Python 后端，无需目标机器安装开发环境。修改源码不会自动更新已有 EXE，需要重新打包。更多说明见 [发布目录说明](release/README.md)。
