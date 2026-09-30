"""应用工厂与接口入口，具体业务逻辑由 AgentService 处理。"""

import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, Header, WebSocket
from fastapi.staticfiles import StaticFiles

from .api.recruitment import recruitment_router
from .browser.client import BrowserRPCClient
from .browser.protocol import BrowserReadRequest, PageReading
from .services.agent import AgentService
from .services.browser import BrowserService
from .services.recruitment import RecruitmentService
from .services.websocket import WebSocketService

logging.basicConfig(level=logging.INFO)


def create_app(token: str | None = None, data_dir: Path | None = None) -> FastAPI:
    load_dotenv(Path(__file__).resolve().parents[1] / ".env", override=False)
    # 每次创建应用都创建独立服务；测试可传令牌，正常启动使用环境变量。
    service = AgentService(token)
    rpc = BrowserRPCClient()
    websocket_service = WebSocketService(service, rpc)
    browser_service = BrowserService(service, rpc)
    recruitment = RecruitmentService(service, rpc, data_dir)

    @asynccontextmanager
    async def lifespan(_app):
        await recruitment.start()
        try:
            yield
        finally:
            await recruitment.close()

    app = FastAPI(title="Job Agent Desktop", version="0.0.1", lifespan=lifespan)
    app.include_router(recruitment_router(recruitment))

    @app.get("/health")
    async def health():
        return service.health()

    @app.get("/agent/state")
    async def get_state(x_job_agent_token: str | None = Header(default=None)):
        return service.get_state(x_job_agent_token)

    @app.websocket("/ws")
    async def websocket(ws: WebSocket):
        await websocket_service.handle(ws)

    @app.post("/browser/read", response_model=PageReading)
    async def read_browser(
        request: BrowserReadRequest,
        x_job_agent_token: str | None = Header(default=None),
    ):
        return await browser_service.read(x_job_agent_token, request)

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
