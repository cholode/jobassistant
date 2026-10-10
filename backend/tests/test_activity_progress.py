"""实时步骤回归：模型等待期间可观测、状态可恢复，异常不泄漏内部材料。"""

import asyncio

import pytest
from fastapi import HTTPException
from test_recruitment import service_at

from app.services.console import ConsoleService


@pytest.mark.asyncio
async def test_progress_emits_steps_before_work_finishes(tmp_path):
    service, agent, browser = await service_at(tmp_path)
    events = []

    async def send(event):
        events.append(event)

    browser.send = send
    try:
        records = await service.discover("test")
        stages = [e["state"]["activity"]["stage"] for e in events]
        assert stages[0] == "reading"
        assert "analyze_job" in stages and "reflect_decision" in stages
        assert stages[-1] == "analyzed"
        # 快照保留当时步骤，不能全被最后一次状态覆盖。
        assert events[0]["state"]["activity"]["stage"] == "reading"
        agent.state.update(mode="auto", status="running")
        console = ConsoleService(service)
        await console.auto.start("test", [records[0]["job"]["id"]], review_each=True)
        async with asyncio.timeout(5):
            while console.auto.state["status"] != "awaiting_review":
                await asyncio.sleep(0.01)
        progress = agent.state["activity"]
        assert progress["stage"] == "review" and progress["status"] == "waiting"
        assert progress["sent_count"] == 1 and progress["current_index"] == 1
        assert progress["company"] == records[0]["job"]["company"]
        assert "message" not in progress and "facts" not in progress
        stages = [e["state"]["activity"]["stage"] for e in events]
        assert (
            stages.index("contacting") < stages.index("sending") < stages.index("sent")
        )
        console.auto.stop()
        await console.auto.task
        assert agent.state["activity"]["stage"] == "stopped"
        assert agent.state["activity"]["status"] == "done"
        # 切换手动分析时清除上一自动队列的进度，避免显示错轮次。
        agent.state["mode"] = "copilot"
        await service.discover("test")
        assert "total" not in agent.state["activity"]
    finally:
        await service.close()


@pytest.mark.asyncio
async def test_analysis_error_replaces_working_state_without_secret(tmp_path):
    service, agent, _ = await service_at(tmp_path)

    async def fail(_):
        raise RuntimeError("private-api-key-never-publish")

    service.discovery.ainvoke = fail
    try:
        with pytest.raises(HTTPException):
            await service.discover("test")
        assert agent.state["activity"]["status"] == "error"
        assert "private-api-key" not in str(agent.state["activity"])
    finally:
        await service.close()
