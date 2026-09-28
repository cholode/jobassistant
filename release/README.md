# 安装包归档

此目录用于存放 Job Agent 不同版本的 Windows EXE 安装包或便携版。
每个版本单独建立子目录，保留旧版本以便回退。

建议结构：

```text
release/
  v0.1.0/
    Job-Agent-Setup-0.1.0.exe
  v0.2.0/
    Job-Agent-Setup-0.2.0.exe
```

打包时将实际产物放入对应版本目录；EXE 等打包产物不提交到 Git。

## v0.0.1

`v0.0.1/Job-Agent-0.0.1-win-x64.exe` 是 Windows x64 免安装版。
双击启动即可，无需安装 Python、Node.js 或手动启动后端。
首次启动需要解压内置运行环境，可能稍慢；关闭窗口会一并结束内置后端。
登录会话存储在当前 Windows 用户的应用数据目录，不会包含在发布包中。

## 重新打包

开发环境需安装 electron-builder（client 开发依赖）和 PyInstaller：

```powershell
uv pip install --python backend/.venv/Scripts/python.exe pyinstaller
powershell -ExecutionPolicy Bypass -File scripts/release.ps1 -Version 0.0.1
```

构建过程使用 [electron-builder](https://www.electron.build/v26/docs/win/) 生成免安装 EXE，使用 [PyInstaller](https://www.pyinstaller.org/en/stable/usage.html) 打包后端。
