"""自主搜索回归：不提供链接即可搜索、筛选、发送，重复页面和异常可终止。"""

import asyncio

import pytest
from test_recruitment import FakeBrowser, page, service_at

from app.services.console import ConsoleService


class SearchBrowser(FakeBrowser):
    def __init__(self):
        super().__init__()
        self.searches = []
        self.opened = []
        self.on_search = None
        self.verification = False

    async def execute(self, action, payload):
        if action == "SEARCH_JOBS":
            self.actions.append(action)
            self.searches.append((payload["keyword"], payload["page"]))
            if self.on_search:
                self.on_search()
            result = page()
            result.platform = "boss"
            result.kind = "verification" if self.verification else "job_list"
            result.notice = "请完成登录验证" if self.verification else ""
            result.url = "https://www.zhipin.com/web/geek/job"
            # 第二页包含重复的旧岗位及新的可投岗位；第三页重复第二页。
            ids = ["senior", "first"] if payload["page"] == 1 else ["first", "second"]
            result.jobs = [
                result.jobs[0].model_copy(
                    update={
                        "id": key,
                        "url": f"https://www.zhipin.com/job_detail/{key}.html",
                    }
                )
                for key in ids
            ]
            return result
        if action == "OPEN_JOB":
            self.opened.append(payload["url"])
            self.page = page()
            self.page.url = payload["url"]
            self.page.platform = "boss"
            key = payload["url"].split("/")[-1].removesuffix(".html")
            self.page.jobs[0] = self.page.jobs[0].model_copy(
                update={
                    "id": key,
                    "url": payload["url"],
                    "recruiter_activity": "3日内活跃",
                    "location": "广州 · 3-5年"
                    if key == "senior"
                    else "广州 · 经验不限",
                    "description": "要求3年以上经验，Go开发"
                    if key == "senior"
                    else "Go 后端实习，经验不限，要求 Redis，至少6个月。",
                }
            )
        return await super().execute(action, payload)


@pytest.mark.asyncio
async def test_search_sends_without_manual_candidates_or_review(tmp_path):
    service, agent, _ = await service_at(tmp_path)
    browser = SearchBrowser()
    service.rpc = browser
    # 发现图也通过这个浏览器读取真实的当前页快照。
    from app.graphs.discovery import build_discovery

    service.discovery = build_discovery(browser, service.repository, service.job_agent)
    console = ConsoleService(service)
    agent.state.update(mode="auto", status="running")
    try:
        await console.auto.start("test", [], source="search", target_count=2)
        await asyncio.wait_for(console.auto.task, 10)
        assert console.auto.state["status"] == "completed"
        assert console.auto.state["sent_count"] == 2
        assert console.auto.state["message"] == "已达到本轮目标"
        assert browser.searches == [("Go", 1), ("Go", 2)]
        assert len(browser.opened) == 3  # 高年限跳过；重复列表岗位不会再次打开。
        assert browser.actions.count("SEND_GREETING") == 2
        assert console.auto.state["reviewed_count"] == 0
        assert any(item["status"] == "skipped" for item in console.auto.state["items"])
    finally:
        await console.auto.close()
        await service.close()


@pytest.mark.asyncio
@pytest.mark.parametrize("case", ["verification", "paused", "repeated"])
async def test_search_stops_without_repeating_writes(tmp_path, case):
    from app.graphs.discovery import build_discovery

    service, agent, _ = await service_at(tmp_path)
    browser = SearchBrowser()
    service.rpc = browser
    service.discovery = build_discovery(browser, service.repository, service.job_agent)
    console = ConsoleService(service)
    agent.state.update(mode="auto", status="running")
    if case == "verification":
        browser.verification = True
    if case == "paused":
        browser.on_search = lambda: console.auto.stop()
    try:
        await console.auto.start("test", [], source="search", target_count=20)
        await asyncio.wait_for(console.auto.task, 15)
        if case == "repeated":
            assert console.auto.state["status"] == "completed"
            assert "翻页结果重复" in console.auto.state["message"]
            assert browser.actions.count("SEND_GREETING") == 2
            assert len(browser.searches) == 6  # 两个关键词各三页，跨关键词仍去重。
        else:
            assert console.auto.state["status"] == "stopped"
            assert not browser.opened
            assert "CONTACT_HR" not in browser.actions
            assert agent.state["status"] == "paused"
    finally:
        await console.auto.close()
        await service.close()
