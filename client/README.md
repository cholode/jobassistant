# 桌面客户端接口

Electron 主进程拥有浏览器与后端连接；React 工作台经 preload 暴露的 window.desktop 发起请求。类型定义集中在 shared。

## 开发命令

在项目根目录使用 `pnpm.cmd --dir client run <命令>`：

| 命令 | 输入/输出 |
| --- | --- |
| dev | 启动 Vite 工作台服务；完整桌面建议用 scripts/dev.ps1 |
| typecheck | 检查 Renderer 和 Electron TypeScript，无输出产物 |
| lint | 类型检查加未使用符号检查 |
| build | 编译 Electron 到 dist-electron，构建页面到 dist |
| test:browser | Node 浏览器 RPC 边界测试，需先 build |
| test:desktop | Electron 完整桌面测试，需后端依赖和客户端构建 |
| format / format:check | 格式化 / 检查 src、electron、shared、tests 和模拟站 JS |

失败通过非零退出码报告。依赖和版本以 package.json、pnpm-lock.yaml 为准。check-environment.mjs 检查前端依赖，check-electron.cjs 检查 Electron 运行环境，统一入口见 [scripts](../scripts/README.md)。electron-builder.json 配置发布资源，tsconfig*.json 区分渲染与主进程编译，vite.config.ts 配置前端构建。

## 调用方向

React → window.desktop → Electron IPC → Python HTTP/WS → Electron 浏览器 RPC → 平台适配器。

- [共享协议与 DesktopAPI](shared/README.md)
- [主进程与 preload](electron/README.md)
- [浏览器控制和 RPC](electron/browser/README.md)
- [招聘 IPC](electron/ipc/README.md)
- [平台适配](electron/platforms/README.md)
- [React 入口](src/README.md)
- [测试](tests/README.md)

令牌只由主进程持有；外部招聘网页不加载工作台 preload，也不获得 window.desktop。
