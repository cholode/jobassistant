# 运维与开发脚本接口

以下命令在项目根目录运行。脚本失败会抛异常/返回非零退出码；依赖先按 [根文档](../README.md) 安装。

| 脚本 | 输入 | 输出与副作用 |
| --- | --- | --- |
| dev.ps1 | 可选 `-Built` switch | 构建并启动后端和 Electron；默认使用 Vite，Built 使用构建页面；生成共享令牌并清理本轮进程 |
| check-env.ps1 | 无参数 | 检查后端依赖、TypeScript/Vite 和 Electron 环境；输出版本与检查结果 |
| check_backend.py | Python 3.12 环境 | 检查 FastAPI TestClient、内存 SQLite、LangGraph 和模型模块导入，不调用外部模型 |
| test.ps1 | 无参数 | 后端 ruff/pytest、客户端 lint/build、RPC 和桌面集成测试 |
| release.ps1 | `-Version` 字符串，默认 0.0.1，格式 x.y.z | PyInstaller 后端构建、electron-builder portable x64 打包，输出 EXE SHA256 |

```powershell
powershell -ExecutionPolicy Bypass -File scripts/dev.ps1
powershell -ExecutionPolicy Bypass -File scripts/dev.ps1 -Built
powershell -ExecutionPolicy Bypass -File scripts/check-env.ps1
powershell -ExecutionPolicy Bypass -File scripts/test.ps1
powershell -ExecutionPolicy Bypass -File scripts/release.ps1 -Version 0.0.1
```

开发需空闲 8765、5173 端口（Built 不运行 Vite）；关闭本轮桌面后脚本清理服务。打包前需安装 PyInstaller，产物写入 build 和 release/v<Version>，不会发布到外部服务。已有同版本构建可能被更新，版本归档约定见 [release](../release/README.md)。

测试结果和截图见 logs；依赖、日志、数据库和二进制目录不属于源码接口文档覆盖范围。
