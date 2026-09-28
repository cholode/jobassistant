"""Standalone backend entry point used by the desktop release."""

import socket
import sys
from pathlib import Path
import os

import uvicorn
from app.main import create_app


if __name__ == "__main__":
    if getattr(sys, "frozen", False):
        os.environ["JOB_AGENT_MOCK_DIR"] = str(Path(sys._MEIPASS) / "mock-site")
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
        listener.bind(("127.0.0.1", 0))
        print(f"JOB_AGENT_PORT={listener.getsockname()[1]}", flush=True)
        server = uvicorn.Server(uvicorn.Config(create_app(), log_level="warning"))
        server.run(sockets=[listener])
