"""应用工厂与接口入口，具体业务逻辑由 AgentService 处理。"""

import logging
import os
from pathlib import Path

from fastapi import FastAPI, Header, WebSocket
from fastapi.staticfiles import StaticFiles

from .services.agent import AgentService
from .services.websocket import WebSocketService

logging.basicConfig(level=logging.INFO)


def create_app(token: str | None = None) -> FastAPI:
    # 每次创建应用都创建独立服务；测试可传令牌，正常启动使用环境变量。
    service = AgentService(token)
    websocket_service = WebSocketService(service)
    app = FastAPI(title="Job Agent Desktop", version="0.0.1")

    @app.get("/health")
    async def health():
        return service.health()

    @app.get("/agent/state")
    async def get_state(x_job_agent_token: str | None = Header(default=None)):
        return service.get_state(x_job_agent_token)

    @app.websocket("/ws")
    async def websocket(ws: WebSocket):
        await websocket_service.handle(ws)

    # 开发时读取仓库中的模拟站，发布版通过环境变量定位内置静态文件。
    app.mount(
        "/mock",
        StaticFiles(
            directory=os.environ.get("JOB_AGENT_MOCK_DIR")
            or Path(__file__).resolve().parents[2] / "mock-site",
            html=True,
        ),
        name="mock",
    )
    return app
