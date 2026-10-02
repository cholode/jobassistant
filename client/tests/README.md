# 客户端测试接口

| 文件 / 导出 | 输入 → 输出与覆盖 |
| --- | --- |
| browser-rpc.mjs | Node test 入口，验证语义命令白名单及读取边界 |
| desktop.mjs | 集成入口，启动隔离后端/Electron，验证导航、缩放、读取、断线和招聘流程 |
| fixtures.freePort() | 无 → Promise<number>；返回临时探测的空闲端口，释放后不保证持续占用 |
| browser-controller.checkController(desktop, moduleUrl) | Playwright ElectronApplication、模块 URL → 异步断言 |
| page-reading.readPageFromPanel(ui, kind) | 工作台 Page、页面种类显示文本 → 异步读取断言 |
| recruitment.checkRecruitment(ui, web) | 工作台 Page、招聘网页 Page → 完整分析与审批断言 |
| release.mjs | 发布版启动与关闭测试入口；RELEASE_EXE 可指定目标 exe |

在根目录运行（需安装客户端及后端依赖）：

```powershell
pnpm.cmd --dir client run build
pnpm.cmd --dir client run test:browser
pnpm.cmd --dir client run test:desktop
# 有发布产物时另外执行：
node client/tests/release.mjs
```

release 默认检查 release/v0.0.1/win-unpacked/Job Agent.exe。集成测试使用隔离用户目录和数据，不接管现有开发实例；日志、截图写入根 logs。测试成功退出 0，断言或启动失败返回非零。fixtures 和检查函数是测试辅助接口，不供产品代码调用。

所有检查统一入口见 [scripts](../../scripts/README.md)。
