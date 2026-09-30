"""招聘接口入口：路由只转交参数，认证和工作流执行由服务负责。"""

from fastapi import APIRouter, Header
from pydantic import BaseModel

from ..jobs.models import Approval, RecruitmentConfig


class PrepareRequest(BaseModel):
    job_id: str


def recruitment_router(service):
    router = APIRouter(prefix="/recruitment")

    @router.get("/state")
    async def state(x_job_agent_token: str | None = Header(default=None)):
        return service.state(x_job_agent_token)

    @router.put("/config")
    async def configure(
        config: RecruitmentConfig, x_job_agent_token: str | None = Header(default=None)
    ):
        return await service.configure(x_job_agent_token, config)

    @router.post("/discover")
    async def discover(x_job_agent_token: str | None = Header(default=None)):
        return await service.discover(x_job_agent_token)

    @router.post("/prepare")
    async def prepare(
        request: PrepareRequest, x_job_agent_token: str | None = Header(default=None)
    ):
        return await service.prepare(x_job_agent_token, request.job_id)

    @router.post("/applications/{key}/approve")
    async def approve(
        key: str,
        approval: Approval,
        x_job_agent_token: str | None = Header(default=None),
    ):
        return await service.approve(x_job_agent_token, key, approval)

    return router
