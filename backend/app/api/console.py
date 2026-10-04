"""Phase 6 工作台接口，所有请求均由服务校验本地认证令牌。"""

from fastapi import APIRouter, Header
from pydantic import BaseModel, ConfigDict, Field

from ..services.model_settings import ModelSettings


class QueueRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    job_ids: list[str] = Field(default_factory=list, max_length=100)
    job_urls: list[str] = Field(default_factory=list, max_length=100)
    review_each: bool = False
    target_count: int = Field(default=20, ge=1, le=100)


class ReviewRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    application_id: str
    notes: str = Field(min_length=1, max_length=3000)
    accepted: bool


class Resolution(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    sent: bool


def console_router(service):
    router = APIRouter(prefix="/console")

    @router.get("/state")
    async def state(x_job_agent_token: str | None = Header(default=None)):
        return service.state(x_job_agent_token)

    @router.put("/model")
    async def model(
        value: ModelSettings, x_job_agent_token: str | None = Header(default=None)
    ):
        service.recruitment.authorize(x_job_agent_token)
        if service.auto.state["status"] in {"running", "awaiting_review"}:
            service.auto.stop()
            await service.auto.publish()
        return service.models.save(value)

    @router.post("/model/test")
    async def test(x_job_agent_token: str | None = Header(default=None)):
        service.recruitment.authorize(x_job_agent_token)
        return await service.models.test()

    @router.post("/auto/start")
    async def start(
        value: QueueRequest, x_job_agent_token: str | None = Header(default=None)
    ):
        return await service.auto.start(
            x_job_agent_token,
            value.job_ids,
            value.job_urls,
            value.review_each,
            value.target_count,
        )

    @router.post("/auto/review")
    async def review(
        value: ReviewRequest, x_job_agent_token: str | None = Header(default=None)
    ):
        result = service.auto.review(
            x_job_agent_token, value.application_id, value.notes, value.accepted
        )
        await service.auto.publish()
        return result

    @router.post("/auto/stop")
    async def stop(x_job_agent_token: str | None = Header(default=None)):
        service.recruitment.authorize(x_job_agent_token)
        result = service.auto.stop()
        await service.auto.publish()
        return result

    @router.post("/chat/capture")
    async def capture(x_job_agent_token: str | None = Header(default=None)):
        return await service.capture_chat(x_job_agent_token)

    @router.post("/resolve")
    async def resolve(
        value: Resolution, x_job_agent_token: str | None = Header(default=None)
    ):
        return await service.resolve(x_job_agent_token, value.id, value.sent)

    return router
