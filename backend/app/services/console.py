"""工作台查询与恢复：统计、持久历史、聊天快照、Agent 追踪和人工核对。"""

from fastapi import HTTPException

from ..browser.protocol import BrowserReadRequest
from ..database.repository import now
from ..jobs.parser import fingerprint
from .auto_run import AutoRunService
from .model_settings import ModelSettingsService


class ConsoleService:
    def __init__(self, recruitment):
        self.recruitment = recruitment
        self.models = ModelSettingsService(recruitment.directory)
        self.auto = AutoRunService(recruitment)

    def state(self, token):
        service = self.recruitment
        service.authorize(token)
        repo = service.repository
        applications = sorted(
            repo.all(repo.applications), key=lambda x: x["updated_at"], reverse=True
        )
        jobs = repo.all(repo.jobs)
        return {
            "applications": applications,
            "events": sorted(
                repo.all(repo.events), key=lambda x: x["time"], reverse=True
            )[:200],
            "chats": repo._get(repo.settings, "chats") or [],
            "traces": service.job_agent.memory.recent(50),
            "model": self.models.state(),
            "auto": self.auto.state,
            "stats": {
                "jobs": len(jobs),
                "recommended": sum(x["analysis"]["decision"] == "apply" for x in jobs),
                "contacted": sum(x["status"] == "WAITING_REPLY" for x in applications),
                "pending": sum(
                    x["status"] == "WAITING_USER_CONFIRMATION" for x in applications
                ),
                "uncertain": sum(x["status"] == "UNCERTAIN" for x in applications),
            },
        }

    async def capture_chat(self, token):
        self.recruitment.authorize(token)
        page = await self.recruitment.rpc.request(
            BrowserReadRequest(command="GET_CHAT_MESSAGES")
        )
        if page.kind != "chat":
            raise HTTPException(400, "请先打开需要记录的招聘会话")
        repo = self.recruitment.repository
        chats = repo._get(repo.settings, "chats") or []
        key = fingerprint(
            {"url": page.url, "title": page.title, "jobs": [x.id for x in page.jobs]}
        )[:24]
        chats = [x for x in chats if x["id"] != key]
        chats.insert(
            0,
            {
                "id": key,
                "url": page.url,
                "title": page.title,
                "messages": [x.model_dump() for x in page.messages],
                "updated_at": now(),
            },
        )
        repo._put(repo.settings, "chats", chats[:100])
        repo.event("CHAT_CAPTURED", key)
        return chats

    async def resolve(self, token, key, sent: bool):
        service = self.recruitment
        service.authorize(token)
        async with service.lock:
            record = service.repository.application(key)
            if not record or record["status"] != "UNCERTAIN":
                raise HTTPException(409, "只有结果不确定的记录可以人工核对")
            # 即使人工判断未发送，也归档而非自动重发，避免重复联系。
            return service.set_status(
                key,
                "WAITING_REPLY" if sent else "CLOSED",
                error="",
                resolution="人工核对已发送" if sent else "人工核对未完成，归档不重发",
                resolved_at=now(),
            )
