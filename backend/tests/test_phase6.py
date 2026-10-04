"""Phase 6 验收：自动队列、停止、配置变化、脱敏、历史和人工核对。"""

import asyncio

import pytest
from fastapi import HTTPException
from test_recruitment import service_at

from app.services.console import ConsoleService
from app.services.model_settings import ModelSettings


@pytest.mark.parametrize(
    "title", ["Go开发实习生", "后端Go实习生", "GO后端开发", "Golang工程师"]
)
def test_go_keyword_accepts_adjacent_chinese(title):
    from app.jobs.rules import contains

    assert contains(title, "Go")
    for unrelated in ["Django工程师", "MongoDB管理员", "Google运维", "Dingo开发"]:
        assert not contains(unrelated, "Go")


@pytest.mark.asyncio
@pytest.mark.parametrize("accepted", [True, False])
async def test_each_send_waits_for_bound_review(tmp_path, accepted):
    service, agent, browser = await service_at(tmp_path)
    console = ConsoleService(service)
    try:
        key = (await service.discover("test"))[0]["job"]["id"]
        agent.state.update(status="running", mode="auto")
        await console.auto.start("test", [key], review_each=True)
        async with asyncio.timeout(5):
            while console.auto.state["status"] != "awaiting_review":
                await asyncio.sleep(0.01)
        assert not console.auto.task.done()
        record = console.auto.state["current_review"]
        assert record["receipt_verified"]
        with pytest.raises(HTTPException):
            console.auto.review("test", "wrong-record", "核实", True)
        assert not console.auto.task.done()
        console.auto.review(
            "test", record["application_id"], "岗位匹配，正文无缺口，回执确认", accepted
        )
        await console.auto.task
        assert console.auto.state["status"] == ("completed" if accepted else "stopped")
        assert console.auto.state["reviewed_count"] == 1
        assert service.repository.application(record["application_id"])["review"][
            "reviewed"
        ]
        assert browser.actions.count("SEND_GREETING") == 1
    finally:
        await console.auto.close()
        await service.close()


def test_algorithm_award_and_graduation_are_preserved_in_greeting():
    from test_recruitment import page

    from app.agents.context import AgentContext
    from app.agents.greeting import greeting
    from app.agents.reflection import DecisionReflector
    from app.jobs.models import JobDecision, RecruitmentConfig
    from app.jobs.parser import parse_job

    job = parse_job(page().jobs[0], "mock", True).model_copy(
        update={"description": "要求Go、数据结构和算法基础", "tags": []}
    )
    config = RecruitmentConfig()
    config.profile.facts = [
        "测试大学计算机本科，2027届。",
        "开发 Go 数据库服务。",
        "开发 Go 即时通信项目。",
        "参加 ICPC、CCPC 算法竞赛并获得三枚铜牌。",
    ]
    candidate = JobDecision(
        decision="apply",
        match_score=80,
        strengths=[],
        concerns=[],
        reason="匹配",
        evidence_ids=[1, 2, 3],
    )
    decision = (
        DecisionReflector()
        .reflect(AgentContext.create(job, config), candidate)
        .decision
    )
    text = greeting(job, decision, config)
    assert "2027届" in text and "三枚铜牌" in text
    assert "Go 数据库服务" in text
    assert "Go 即时通信项目" not in text  # 避免两段同类经历挤掉算法证据。


def test_expired_deadline_and_stale_recruiter_are_not_auto_applied():
    from test_recruitment import page

    from app.agents.context import AgentContext
    from app.agents.reflection import DecisionReflector
    from app.jobs.models import JobDecision, RecruitmentConfig
    from app.jobs.parser import parse_job
    from app.jobs.rules import hard_filter

    job = parse_job(page().jobs[0], "mock", True)
    config = RecruitmentConfig()
    config.profile.facts = ["开发 Go 后端"]
    expired = job.model_copy(update={"description": "招聘截止日期：2000.02.28"})
    assert any("截止日期" in x for x in hard_filter(expired, config.preferences))
    future = job.model_copy(update={"description": "招聘截止日期：2099年12月31日"})
    assert not hard_filter(future, config.preferences)
    stale = job.model_copy(update={"description": "使用Go。招聘者半年前活跃"})
    result = DecisionReflector().reflect(
        AgentContext.create(stale, config),
        JobDecision(
            decision="apply",
            match_score=85,
            strengths=[],
            concerns=[],
            reason="匹配",
            evidence_ids=[0],
        ),
    )
    assert result.decision.decision == "review"
    assert "长期不活跃" in result.decision.reason


def test_combined_stack_requires_evidence_for_both_sides():
    from test_recruitment import page

    from app.agents.context import AgentContext
    from app.agents.reflection import DecisionReflector
    from app.jobs.models import JobDecision, RecruitmentConfig
    from app.jobs.parser import parse_job

    job = parse_job(page().jobs[0], "mock", True).model_copy(
        update={"title": "全栈实习生（Go+Vue3）"}
    )
    config = RecruitmentConfig()
    config.profile.facts = ["开发 Go 后端项目"]
    candidate = JobDecision(
        decision="apply",
        match_score=88,
        strengths=[],
        concerns=[],
        reason="匹配",
        evidence_ids=[0],
    )
    result = DecisionReflector().reflect(AgentContext.create(job, config), candidate)
    assert result.decision.decision == "review" and "Vue3" in result.decision.reason
    config.profile.facts.append("开发 Vue3 页面并与后端联调")
    result = DecisionReflector().reflect(AgentContext.create(job, config), candidate)
    assert result.decision.decision == "apply"


def test_internship_label_does_not_override_experience_requirement():
    from test_recruitment import page

    from app.agents.context import AgentContext
    from app.agents.reflection import DecisionReflector
    from app.jobs.models import JobDecision, RecruitmentConfig
    from app.jobs.parser import parse_job

    job = parse_job(page().jobs[0], "mock", True).model_copy(
        update={"description": "要求Go开发，1~3年以上应用系统开发经验，实习至少6个月"}
    )
    config = RecruitmentConfig()
    config.profile.facts = ["开发 Go 项目"]
    candidate = JobDecision(
        decision="apply",
        match_score=78,
        strengths=[],
        concerns=[],
        reason="匹配",
        evidence_ids=[0],
    )
    result = DecisionReflector().reflect(AgentContext.create(job, config), candidate)
    assert result.decision.decision == "review"
    assert "经验" in result.decision.reason


@pytest.mark.asyncio
async def test_url_queue_rejects_foreign_origin_before_navigation(tmp_path):
    service, agent, browser = await service_at(tmp_path)
    console = ConsoleService(service)
    try:
        agent.state.update(status="running", mode="auto")
        with pytest.raises(HTTPException):
            await console.auto.start(
                "test", [], ["https://evil.example/job_detail/a.html"]
            )
        assert browser.actions == []
    finally:
        await service.close()


@pytest.mark.asyncio
async def test_auto_requires_mode_and_never_recontacts(tmp_path):
    service, agent, browser = await service_at(tmp_path)
    console = ConsoleService(service)
    try:
        record = (await service.discover("test"))[0]
        key = record["job"]["id"]
        agent.state.update(status="running", mode="copilot")
        with pytest.raises(HTTPException):
            await console.auto.start("test", [key])
        agent.state["mode"] = "auto"
        await console.auto.start("test", [key])
        await console.auto.task
        assert console.auto.state["status"] == "completed", console.auto.state
        assert browser.actions == ["OPEN_JOB", "CONTACT_HR", "SEND_GREETING"]
        await console.auto.start("test", [key])
        await console.auto.task
        assert len(browser.actions) == 3
        assert console.auto.state["items"][0]["status"] == "skipped"
    finally:
        await console.auto.close()
        await service.close()


@pytest.mark.asyncio
async def test_auto_stop_and_config_change_before_first_action(tmp_path):
    service, agent, browser = await service_at(tmp_path)
    console = ConsoleService(service)
    try:
        key = (await service.discover("test"))[0]["job"]["id"]
        agent.state.update(status="running", mode="auto")
        await console.auto.start("test", [key])
        console.auto.stop()
        await console.auto.task
        assert browser.actions == []
        agent.state.update(status="running", mode="auto")
        await console.auto.start("test", [key])
        config = service.repository.config()
        config.profile.facts.append("配置改变")
        await service.configure("test", config)
        await console.auto.task
        assert browser.actions == []
        assert "变化" in console.auto.state["message"]
    finally:
        await console.auto.close()
        await service.close()


@pytest.mark.asyncio
async def test_console_secret_redaction_and_resolution(tmp_path, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-secret-do-not-return")
    service, _agent, browser = await service_at(tmp_path)
    console = ConsoleService(service)
    try:
        state = console.state("test")
        assert "test-secret" not in str(state)
        with pytest.raises(HTTPException):
            console.state("wrong")
        key = (await service.discover("test"))[0]["job"]["id"]
        record = await service.prepare("test", key)
        service.set_status(record["id"], "UNCERTAIN")
        resolved = await console.resolve("test", record["id"], False)
        assert resolved["status"] == "CLOSED"
        assert browser.actions == []
        assert console.state("test")["traces"]
    finally:
        await service.close()


def test_model_settings_validation():
    with pytest.raises(ValueError):
        ModelSettings(base_url="http://example.com/v1", model="x")
    with pytest.raises(ValueError):
        ModelSettings(base_url="https://example.com/v1?key=secret", model="x")


def test_external_greeting_omits_private_gaps():
    from test_recruitment import page

    from app.agents.greeting import greeting
    from app.jobs.models import JobDecision, RecruitmentConfig
    from app.jobs.parser import parse_job

    config = RecruitmentConfig()
    config.profile.facts = ["开发 Go 后端项目"]
    config.profile.arrival_date = "面试通过后3天内到岗"
    decision = JobDecision(
        decision="apply",
        match_score=80,
        strengths=["Go 项目匹配"],
        concerns=["简历未体现大规模性能优化成果"],
        reason="内部分析",
        matched_skills=["Go"],
        evidence_ids=[0],
    )
    text = greeting(parse_job(page().jobs[0], "mock", True), decision, config)
    assert "Go 后端项目" in text
    assert "面试通过后3天内到岗" in text
    assert "未体现" not in text and "内部分析" not in text


def test_internship_without_title_keyword_and_availability():
    from test_recruitment import page

    from app.agents.context import AgentContext
    from app.agents.reflection import DecisionReflector
    from app.jobs.models import JobDecision, RecruitmentConfig
    from app.jobs.parser import parse_job

    summary = (
        page()
        .jobs[0]
        .model_copy(
            update={
                "title": "Golang开发（能转正）",
                "salary": "200-300元/天",
                "location": "上海 5天/周 6个月 本科",
            }
        )
    )
    job = parse_job(summary, "boss", True)
    assert job.employment == "internship" and job.experience_months == 0
    config = RecruitmentConfig()
    config.profile.facts = ["开发 Go 后端"]
    config.profile.days_per_week = 4
    candidate = JobDecision(
        decision="apply", match_score=85, strengths=[], concerns=[], reason="匹配"
    )
    result = DecisionReflector().reflect(AgentContext.create(job, config), candidate)
    assert result.decision.decision == "skip"


def test_greeting_prioritizes_role_specific_project():
    from test_recruitment import page

    from app.agents.context import AgentContext
    from app.agents.greeting import greeting
    from app.agents.reflection import DecisionReflector
    from app.jobs.models import JobDecision, RecruitmentConfig
    from app.jobs.parser import parse_job

    job = parse_job(page().jobs[0], "mock", True).model_copy(
        update={"title": "AI Agent 全栈实习生（Electron + Go）", "tags": ["React"]}
    )
    config = RecruitmentConfig()
    config.profile.facts = [
        "开发 Go 数据库服务。",
        "开发 Go 即时通信并集成 AI Agent。",
        "借助 AI 开发 Electron + React 桌面 Agent，验证工具调用。",
    ]
    decision = JobDecision(
        decision="apply",
        match_score=80,
        strengths=[],
        concerns=["缺少金融经历"],
        reason="内部",
        evidence_ids=[0, 1, 2, 99],
        matched_skills=["Go"],
    )
    decision = (
        DecisionReflector().reflect(AgentContext.create(job, config), decision).decision
    )
    assert 2 in decision.evidence_ids  # 未在技能清单单列 Electron 也不能误删真实项目。
    text = greeting(job, decision, config)
    assert "Electron + React" in text
    assert text.index("Electron + React") < text.index("Go 即时通信")
    assert "缺少金融经历" not in text
    assert "。；" not in text and "。。" not in text


@pytest.mark.asyncio
async def test_auto_rejects_paused_with_http_error(tmp_path):
    service, _agent, _browser = await service_at(tmp_path)
    console = ConsoleService(service)
    try:
        with pytest.raises(HTTPException) as error:
            await console.auto.start("test", ["example"])
        assert error.value.status_code == 409
    finally:
        await service.close()
