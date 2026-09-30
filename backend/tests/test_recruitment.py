"""招聘业务回归测试：用模拟浏览器验证审批、限额、恢复和防重复执行。"""

import pytest
from fastapi import HTTPException

from app.browser.client import BrowserRPCError
from app.browser.protocol import ChatMessage, JobSummary, PageReading
from app.jobs.models import Approval, RecruitmentConfig
from app.jobs.parser import parse_job
from app.jobs.rules import hard_filter
from app.services.agent import AgentService
from app.services.recruitment import RecruitmentService


def page():
    return PageReading(
        url="http://127.0.0.1:8765/mock/#job/4",
        title="Go 实习",
        platform="mock",
        kind="job_detail",
        text="Go",
        truncated=False,
        read_at="2026-09-29",
        jobs=[
            JobSummary(
                id="4",
                title="Go 后端实习生",
                company="测试公司",
                salary="180-280元/天",
                location="广州 · 经验不限",
                url="http://127.0.0.1:8765/mock/#job/4",
                tags=["Go", "Redis"],
                description="Go 后端实习，经验不限，要求 Redis、SSE，至少6个月。",
            )
        ],
    )


class FakeBrowser:
    """记录语义命令并模拟回执，可注入沟通后暂停或超时，绝不访问真实网站。"""

    def __init__(self):
        self.page = page()
        self.actions = []
        self.after_contact = None
        self.fail_contact = False

    async def request(self, _request):
        return self.page

    async def execute(self, action, payload):
        self.actions.append(action)
        if action == "CONTACT_HR":
            if self.after_contact:
                self.after_contact()
            if self.fail_contact:
                raise BrowserRPCError("TIMEOUT", "点击后回执超时")
        result = self.page.model_copy(deep=True)
        result.kind = "chat"
        result.operation = {"operation_id": payload["operation_id"], "action": action}
        if action == "SEND_GREETING":
            result.messages = [ChatMessage(sender="me", text=payload["message"])]
        return result


async def service_at(path):
    """创建使用临时数据库的服务，统一设置测试资料及可控的发送间隔。"""
    agent, browser = AgentService("test"), FakeBrowser()
    service = RecruitmentService(agent, browser, path)
    await service.start()
    config = RecruitmentConfig()
    config.profile.name = "测试求职者"
    config.profile.facts = ["独立开发 Go 项目，使用 Redis 缓存"]
    config.profile.days_per_week = 5
    config.profile.months = 6
    config.preferences.interval_seconds = 0
    await service.configure("test", config)
    return service, agent, browser


async def prepare(service):
    records = await service.discover("test")
    return await service.prepare("test", records[0]["job"]["id"])


def test_hard_rules_and_unknown_fields():
    summary = page().jobs[0]
    preferences = RecruitmentConfig().preferences
    job = parse_job(summary, "mock", True)
    assert job.experience_months == 0
    assert job.salary_min_monthly is None  # 日薪不能当成月薪比较。
    assert hard_filter(job, preferences) == []
    senior = parse_job(
        summary.model_copy(
            update={
                "title": "Go 工程师",
                "location": "上海 · 3-5年",
                "description": "要求3年以上经验",
            }
        ),
        "mock",
        True,
    )
    assert senior.experience_months == 36
    assert any("经验" in x for x in hard_filter(senior, preferences))
    preferences.cities = ["北京"]
    preferences.blacklist = ["测试公司"]
    assert len(hard_filter(job, preferences)) == 2


@pytest.mark.asyncio
async def test_approval_and_exactly_once(tmp_path):
    service, agent, browser = await service_at(tmp_path)
    try:
        record = await prepare(service)
        assert browser.actions == []
        assert "至少6个月" in record["message"]
        assert "到岗" not in record["message"]
        item = service.repository.job(record["job_id"])
        assert any("SSE" in x and "未体现" in x for x in item["analysis"]["concerns"])
        with pytest.raises(HTTPException) as caught:
            await service.approve("test", record["id"], Approval(approved=True))
        assert caught.value.status_code == 409
        agent.state.update(status="running", mode="copilot")
        done = await service.approve(
            "test", record["id"], Approval(approved=True, message="确认过的补充消息")
        )
        assert done["status"] == "WAITING_REPLY"
        assert browser.actions == ["CONTACT_HR", "SEND_GREETING"]
        await service.approve("test", record["id"], Approval(approved=True))
        assert len(browser.actions) == 2
        assert (await service.prepare("test", record["job_id"]))["id"] == record["id"]
    finally:
        await service.close()


@pytest.mark.asyncio
@pytest.mark.parametrize("failure", ["pause", "timeout"])
async def test_uncertain_contact_never_resends(tmp_path, failure):
    service, agent, browser = await service_at(tmp_path)
    try:
        record = await prepare(service)
        agent.state.update(status="running", mode="copilot")
        if failure == "pause":
            browser.after_contact = lambda: agent.state.update(status="paused")
        else:
            browser.fail_contact = True
        result = await service.approve("test", record["id"], Approval(approved=True))
        assert result["status"] == "UNCERTAIN"
        assert browser.actions == ["CONTACT_HR"]
        agent.state["status"] = "running"
        await service.approve("test", record["id"], Approval(approved=True))
        assert browser.actions == ["CONTACT_HR"]
    finally:
        await service.close()


@pytest.mark.asyncio
async def test_reject_and_changed_page(tmp_path):
    service, agent, browser = await service_at(tmp_path)
    try:
        record = await prepare(service)
        assert (await service.approve("test", record["id"], Approval(approved=False)))[
            "status"
        ] == "REJECTED"
        assert browser.actions == []
        record = await service.prepare("test", record["job_id"])
        browser.page.jobs[0].company = "另一个公司"
        agent.state.update(status="running", mode="copilot")
        assert (await service.approve("test", record["id"], Approval(approved=True)))[
            "status"
        ] == "ERROR"
        assert browser.actions == []
    finally:
        await service.close()


@pytest.mark.asyncio
async def test_pending_approval_survives_restart(tmp_path):
    service, _agent, _browser = await service_at(tmp_path)
    record = await prepare(service)
    await service.close()
    service, agent, browser = await service_at(tmp_path)
    try:
        agent.state.update(status="running", mode="copilot")
        done = await service.approve("test", record["id"], Approval(approved=True))
        assert done["status"] == "WAITING_REPLY"
        assert len(browser.actions) == 2
    finally:
        await service.close()


@pytest.mark.asyncio
async def test_profile_change_refreshes_evidence_and_invalidates_approval(tmp_path):
    service, agent, browser = await service_at(tmp_path)
    try:
        record = await prepare(service)
        config = service.repository.config()
        config.profile.facts = ["独立开发 Go 消息服务，使用 Redis"]
        await service.configure("test", config)
        agent.state.update(status="running", mode="copilot")
        with pytest.raises(HTTPException) as caught:
            await service.approve("test", record["id"], Approval(approved=True))
        assert caught.value.status_code == 409
        assert browser.actions == []
        updated = await service.prepare("test", record["job_id"])
        assert "Go 消息服务" in updated["message"]
        assert "Redis 缓存" not in updated["message"]
        assert updated["operation_id"] != record["operation_id"]
    finally:
        await service.close()


@pytest.mark.asyncio
async def test_daily_limit_blocks_second_contact(tmp_path):
    service, agent, browser = await service_at(tmp_path)
    try:
        config = service.repository.config()
        config.preferences.daily_limit = 1
        await service.configure("test", config)
        agent.state.update(status="running", mode="copilot")
        first = await prepare(service)
        await service.approve("test", first["id"], Approval(approved=True))
        browser.page.jobs[0].id = "5"
        browser.page.jobs[0].url = "http://127.0.0.1:8765/mock/#job/5"
        browser.page.url = browser.page.jobs[0].url
        second = await prepare(service)
        result = await service.approve("test", second["id"], Approval(approved=True))
        assert result["status"] == "ERROR"
        assert "每日沟通上限" in result["error"]
        assert browser.actions == ["CONTACT_HR", "SEND_GREETING"]
    finally:
        await service.close()


@pytest.mark.asyncio
async def test_interrupted_send_is_not_replayed_after_restart(tmp_path):
    service, _agent, _browser = await service_at(tmp_path)
    record = await prepare(service)
    service.set_status(record["id"], "SENDING")
    await service.close()
    service, agent, browser = await service_at(tmp_path)
    try:
        agent.state.update(status="running", mode="copilot")
        result = await service.approve("test", record["id"], Approval(approved=True))
        assert result["status"] == "UNCERTAIN"
        assert browser.actions == []
    finally:
        await service.close()
