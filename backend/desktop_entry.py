"""发布版后端入口，由 Electron 启动；开发模式直接使用 Uvicorn 工厂入口。"""

import socket
import sys
from pathlib import Path
import os

import uvicorn
from app.main import create_app


if __name__ == "__main__":
    if getattr(sys, "frozen", False):
        # PyInstaller 资源位于 _MEIPASS，不依赖用户启动时的工作目录。
        os.environ["JOB_AGENT_MOCK_DIR"] = str(Path(sys._MEIPASS) / "mock-site")
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
        # 绑定本机随机空闲端口，将同一个套接字交给 Uvicorn，避免端口被抢占。
        listener.bind(("127.0.0.1", 0))
        # 通过标准输出告知父进程实际端口；flush 保证 Electron 及时读到。
        print(f"JOB_AGENT_PORT={listener.getsockname()[1]}", flush=True)
        server = uvicorn.Server(uvicorn.Config(create_app(), log_level="warning"))
        server.run(sockets=[listener])
