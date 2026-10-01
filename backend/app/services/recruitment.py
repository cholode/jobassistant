"""招聘用例服务：模型、规则、持久化和图编排在这里组装。"""

import asyncio
import os
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

import aiosqlite
from fastapi import HTTPException
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
from langgraph.types import Command

from ..agents.greeting import greeting
from ..agents.job_agent import JobAgent
from ..agents.memory import SQLiteMemory
from ..browser.protocol import BrowserReadRequest
from ..database.repository import Repository, now
from ..graphs.application import build_application
from ..graphs.discovery import build_discovery
from ..jobs.models import Approval, Job, RecruitmentConfig
from ..jobs.parser import fingerprint, parse_job
from ..jobs.rules import hard_filter


class RecruitmentService:
    def __init__(self, agent, rpc, directory: Path | None = None):
        self.agent, self.rpc = agent, rpc
        self.directory = directory or Path(
            os.getenv(
                "JOB_AGENT_DATA_DIR",
                str(Path(__file__).resolve().parents[3] / "private"),
            )
        )
        self.repository = Repository(self.directory)
        self.lock = asyncio.Lock()
        self.job_agent = JobAgent(SQLiteMemory(self.directory / "agent-memory.db"))
        self.discovery = build_discovery(rpc, self.repository, self.job_agent)
        self.connection = None
        self.graph = None

    async def start(self):
        """初始化图检查点，并标记上次中断且可能已有副作用的记录。"""
        self.connection = await aiosqlite.connect(self.directory / "workflow.db")
        saver = AsyncSqliteSaver(self.connection)
        await saver.setup()
        self.graph = build_application(self, saver)
        self.repository.recover()

    async def close(self):
        if self.connection:
            await self.connection.close()
        self.repository.engine.dispose()

    def authorize(self, token):
        self.agent.get_state(token)

    def state(self, token):
        self.authorize(token)
        return {
            "config": self.repository.config().model_dump(),
            "jobs": self.repository.all(self.repository.jobs),
            "applications": self.repository.all(self.repository.applications),
            "events": self.repository.all(self.repository.events)[-100:],
            "model_configured": bool(
                os.getenv("OPENAI_API_KEY") and os.getenv("JOB_AGENT_MODEL")
            ),
        }

    async def configure(self, token, config: RecruitmentConfig):
        self.authorize(token)
        async with self.lock:
            self.repository.save_config(config)
        return self.state(token)

    async def discover(self, token):
        self.authorize(token)
        async with self.lock:
            try:
                result = await self.discovery.ainvoke({})
                return result["records"]
            except Exception as error:
                self.repository.event(
                    "DISCOVERY_FAILED", "current", type(error).__name__
                )
                raise HTTPException(400, str(error)[:1000]) from error

    def set_status(self, key, status, **extra):
        record = self.repository.application(key)
        if record is None:
            raise ValueError("投递记录不存在")
        record = self.repository.save_application({**record, **extra, "status": status})
        self.repository.event(status, key)
        return record

    def running(self):
        if (
            self.agent.state["status"] != "running"
            or self.agent.state["mode"] != "copilot"
        ):
            raise ValueError("执行已停止：请切换 Copilot 并恢复，再重新确认")

    async def prepare(self, token, job_id):
        """生成绑定当前资料的审批卡，到图的人工中断点为止，不点击网页。"""
        self.authorize(token)
        async with self.lock:
            item = self.repository.job(job_id)
            if not item:
                raise HTTPException(404, "请先分析岗位")
            job = Job.model_validate(item["job"])
            config = self.repository.config()
            if not job.detail_complete or not job.company or not job.title:
                raise HTTPException(400, "请打开完整职位详情后重新分析")
            blocked = hard_filter(job, config.preferences)
            if blocked:
                raise HTTPException(400, "岗位被筛选规则排除，不能发起投递")
            if not config.profile.facts:
                raise HTTPException(400, "请先填写简历事实，避免生成无依据的招呼语")
            existing = self.repository.application_for_job(job_id)
            if existing and existing["status"] not in {
                "WAITING_USER_CONFIRMATION",
                "REJECTED",
                "ERROR",
            }:
                return existing
            # 使用最新材料重新评估，防止修改简历后沿用旧证据索引。
            decision = await self.job_agent.evaluate(job, config)
            self.repository.save_job(job, decision)
            if decision.decision == "skip":
                raise HTTPException(400, "岗位分析建议跳过，不能发起投递")
            # 确认卡绑定岗位内容、个人材料和消息，过期审批不能用于新岗位。
            record = {
                "id": existing["id"] if existing else str(uuid4()),
                "operation_id": str(uuid4()),
                "job_id": job_id,
                "company": job.company,
                "title": job.title,
                "job": job.model_dump(),
                "profile_hash": fingerprint(config.model_dump()),
                "message": greeting(job, decision, config),
                "status": "WAITING_USER_CONFIRMATION",
                "created_at": now(),
                "error": "",
                "resume_policy": "对方未回复前不发送附件；当前阶段不提供附件发送功能",
            }
            self.repository.save_application(record)
            await self.graph.ainvoke(
                {"application_id": record["id"]},
                {"configurable": {"thread_id": record["operation_id"]}},
            )
            self.repository.event("APPROVAL_REQUIRED", record["id"])
            return record

    async def approve(self, token, key, approval: Approval):
        """串行恢复审批图；已处理的请求只返回记录，避免双击重复执行。"""
        self.authorize(token)
        async with self.lock:
            record = self.repository.application(key)
            if record is None:
                raise HTTPException(404, "投递记录不存在")
            if record["status"] != "WAITING_USER_CONFIRMATION":
                return record  # 双击确认或重放请求不会再次执行副作用。
            if approval.approved:
                try:
                    self.running()
                except ValueError as error:
                    raise HTTPException(409, str(error)) from error
                if (
                    fingerprint(self.repository.config().model_dump())
                    != record["profile_hash"]
                ):
                    raise HTTPException(409, "个人材料或规则已变化，请重新生成确认卡")
                if approval.message is not None:
                    record = self.repository.save_application(
                        {**record, "message": approval.message.strip()}
                    )
                if not record["message"]:
                    raise HTTPException(400, "消息不能为空")
            try:
                await self.graph.ainvoke(
                    Command(resume={"approved": approval.approved}),
                    {"configurable": {"thread_id": record["operation_id"]}},
                )
            except Exception as error:  # noqa: BLE001 — 图中任意失败都必须持久化，防止副作用重发
                current = self.repository.application(key)
                # 点击后未取得回执属于结果不确定，绝不自动重发。
                status = (
                    "UNCERTAIN"
                    if current["status"] in {"CONTACTING", "CONTACTED", "SENDING"}
                    else "ERROR"
                )
                self.set_status(key, status, error=str(error)[:1000])
            return self.repository.application(key)

    async def verify_application(self, key):
        """副作用前核验平台、岗位指纹、筛选规则及每日次数和间隔。"""
        self.running()
        record = self.repository.application(key)
        job = Job.model_validate(record["job"])
        # 真实平台写入必须先有已验证的专用适配器；不把通用正文读取当成可投递。
        if job.platform != "mock":
            raise ValueError("该平台投递适配器尚未验证，请手动沟通")
        page = await self.rpc.request(
            BrowserReadRequest(command="GET_JOB_DETAIL", expected_url=job.url)
        )
        if (
            not page.jobs
            or parse_job(page.jobs[0], page.platform, True).fingerprint
            != job.fingerprint
        ):
            raise ValueError("当前岗位内容已变化，请重新分析并确认")
        config = self.repository.config()
        if hard_filter(job, config.preferences):
            raise ValueError("岗位不再符合筛选规则")
        attempts = [
            x
            for x in self.repository.all(self.repository.applications)
            if x.get("contact_attempt_at")
        ]
        today = now()[:10]
        if (
            sum(x["contact_attempt_at"][:10] == today for x in attempts)
            >= config.preferences.daily_limit
        ):
            raise ValueError("已达到每日沟通上限")
        if attempts:
            latest = max(
                datetime.fromisoformat(x["contact_attempt_at"]) for x in attempts
            )
            if (
                datetime.now(UTC) - latest
            ).total_seconds() < config.preferences.interval_seconds:
                raise ValueError("尚未达到投递间隔，请稍后重新确认")
        self.running()
        self.set_status(key, "APPROVED")

    def payload(self, key):
        record = self.repository.application(key)
        job = record["job"]
        return {
            "operation_id": record["operation_id"],
            "job_url": job["url"],
            "source_id": job["source_id"],
            "title": job["title"],
            "company": job["company"],
            "message": record["message"],
        }

    async def contact(self, key):
        """先落库沟通尝试，再点击；没有可信回执时不认定执行成功。"""
        self.running()
        record = self.repository.application(key)
        if record["status"] != "APPROVED":
            raise ValueError("沟通状态异常，禁止重复执行")
        self.set_status(key, "CONTACTING", contact_attempt_at=now())
        page = await self.rpc.execute("CONTACT_HR", self.payload(key))
        if (
            not page.operation
            or page.operation.get("operation_id") != record["operation_id"]
            or page.operation.get("action") != "CONTACT_HR"
        ):
            raise ValueError("未能确认目标会话，需人工核对")
        self.set_status(key, "CONTACTED")

    async def send_greeting(self, key):
        """仅向已确认会话发送，并核对网页中的己方消息后进入等待回复。"""
        self.running()
        record = self.repository.application(key)
        if record["status"] != "CONTACTED":
            raise ValueError("尚未确认目标会话")
        self.set_status(key, "SENDING")
        page = await self.rpc.execute("SEND_GREETING", self.payload(key))
        if (
            not page.operation
            or page.operation.get("operation_id") != record["operation_id"]
            or page.operation.get("action") != "SEND_GREETING"
            or not any(
                x.sender == "me" and x.text == record["message"] for x in page.messages
            )
        ):
            raise ValueError("未取得发送成功回执，禁止自动重发")
        self.set_status(key, "WAITING_REPLY", sent_at=now())
