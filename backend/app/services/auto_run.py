"""自动投递队列：显式启动、绑定配置、逐岗位执行；异常暂停且重启不自动续发。"""

import asyncio
import re
from datetime import UTC, datetime
from urllib.parse import urlsplit
from uuid import uuid4

from fastapi import HTTPException

from ..agents.search import JobSearchAgent
from ..browser.client import BrowserRPCError
from ..browser.protocol import BrowserReadRequest
from ..database.repository import now
from ..jobs.models import Approval
from ..jobs.parser import fingerprint
from .application_review import build_review


class AutoRunService:
    def __init__(self, recruitment):
        self.service = recruitment
        self.task = None
        self.cancelled = False
        self.review_event = asyncio.Event()
        saved = recruitment.repository._get(recruitment.repository.settings, "auto_run")
        self.state = saved or {
            "status": "idle",
            "items": [],
            "message": "尚未启动自动任务",
        }
        if self.state["status"] in {"running", "awaiting_review", "stopping"}:
            self.update(
                status="stopped", message="上次任务被中断，请核对记录后重新启动"
            )

    def update(self, **values):
        self.state = {**self.state, **values, "updated_at": now()}
        repo = self.service.repository
        repo._put(repo.settings, "auto_run", self.state)

    async def start(
        self,
        token,
        job_ids,
        job_urls=None,
        review_each=False,
        target_count=20,
        source="selected",
        max_search_pages=10,
    ):
        self.service.authorize(token)
        try:
            self.service.running()
        except ValueError as error:
            raise HTTPException(409, str(error)) from error
        if self.service.agent.state["mode"] != "auto":
            raise HTTPException(409, "请选择 Auto 模式并恢复 Agent")
        if self.task and not self.task.done():
            raise HTTPException(409, "自动队列正在运行")
        job_urls = job_urls or []
        if source not in {"selected", "search"} or not 1 <= max_search_pages <= 30:
            raise HTTPException(400, "无效搜索任务参数")
        config = self.service.repository.config()
        if source == "search" and (
            not config.preferences.keywords
            or any(len(word) > 100 for word in config.preferences.keywords)
            or not config.profile.facts
        ):
            raise HTTPException(400, "请先保存求职关键词（每条最多100字）和简历事实")
        if source == "search" and (job_ids or job_urls):
            raise HTTPException(400, "自主搜索不需要传入候选岗位")
        if source == "selected" and not 1 <= len(job_ids) + len(job_urls) <= 100:
            raise HTTPException(400, "请选择或粘贴 1–100 个岗位")
        urls = []
        for raw in job_urls:
            url = urlsplit(raw.strip())
            if (
                url.scheme != "https"
                or url.netloc != "www.zhipin.com"
                or not re.fullmatch(r"/job_detail/[A-Za-z0-9_-]+\.html", url.path)
            ):
                raise HTTPException(400, "只接受 BOSS 独立职位详情链接")
            urls.append(f"https://www.zhipin.com{url.path}")
        self.cancelled = False
        self.review_event.clear()
        self.update(
            id=str(uuid4()),
            status="running",
            items=[],
            message="开始逐项检查",
            job_ids=list(dict.fromkeys(job_ids)),
            job_urls=list(dict.fromkeys(urls)),
            review_each=review_each,
            target_count=max(1, min(target_count, 100)),
            sent_count=0,
            reviewed_count=0,
            current_review=None,
            source=source,
            max_search_pages=max_search_pages,
            search_keyword="",
            search_page=0,
            discovered_count=0,
            current_index=0,
            total=0,
            config_hash=fingerprint(self.service.repository.config().model_dump()),
        )
        self.task = asyncio.create_task(self.run(token))
        return self.state

    def stop(self):
        # 不取消正在等待的写入回执，防止丢失真实执行结果；暂停状态立即阻止下一步。
        self.cancelled = True
        self.review_event.set()
        self.service.agent.state["status"] = "paused"
        self.update(
            status="stopping" if self.task and not self.task.done() else "stopped",
            message="已请求停止，不会发起下一次操作",
        )
        return self.state

    async def close(self):
        self.cancelled = True
        if self.task and not self.task.done():
            self.task.cancel()
            try:
                await self.task
            except asyncio.CancelledError:
                pass

    def review(self, token, application_id, notes, accepted):
        """复盘必须绑定当前记录；旧按钮或重复请求不能放行下一条。"""
        self.service.authorize(token)
        current = self.state.get("current_review")
        if (
            self.state["status"] != "awaiting_review"
            or not current
            or current["application_id"] != application_id
            or not notes.strip()
        ):
            raise HTTPException(409, "请核对当前投递并填写评估意见")
        repo = self.service.repository
        completed = {
            **current,
            "reviewed": True,
            "accepted": accepted,
            "notes": notes.strip()[:3000],
            "reviewed_at": now(),
        }
        record = repo.application(application_id)
        repo.save_application({**record, "review": completed})
        self.update(
            current_review=completed,
            reviewed_count=self.state["reviewed_count"] + 1,
            status="running",
            message="复盘已保存，继续检查下一岗",
        )
        repo.event("APPLICATION_REVIEWED", application_id, notes.strip()[:3000])
        if not accepted:
            self.stop()
        self.review_event.set()
        return self.state

    async def after_application(self, record, analysis):
        """每次发送立刻生成私人复盘卡，必要时等待检查后才继续下一岗。"""
        repo = self.service.repository
        review = build_review(record, analysis)
        repo.save_application({**record, "review": review})
        self.update(sent_count=self.state["sent_count"] + 1, current_review=review)
        if not self.state["review_each"]:
            return
        self.review_event.clear()
        self.update(
            status="awaiting_review", message="本岗已发送，请核对页面和介绍后填写复盘"
        )
        await self.service.activity.report(
            "review",
            record["job"],
            status="waiting",
            sent_count=self.state["sent_count"],
        )
        while not self.review_event.is_set():
            self.check()
            try:
                await asyncio.wait_for(self.review_event.wait(), timeout=1)
            except TimeoutError:
                pass
        self.check()

    async def publish(self):
        """立即同步暂停状态，避免桌面继续沿用下一次心跳前的运行权限。"""
        self.service.agent.state["revision"] += 1
        try:
            await self.service.rpc.send(self.service.agent.event("agent_state"))
        except (BrowserRPCError, AttributeError):
            # 无桌面连接时状态仍保留；重连握手会读取最新快照。
            pass

    def check(self):
        if self.cancelled or self.service.agent.state["mode"] != "auto":
            raise ValueError("自动任务已停止")
        self.service.running()
        if (
            fingerprint(self.service.repository.config().model_dump())
            != self.state["config_hash"]
        ):
            raise ValueError("资料或设置变化，自动任务已停止")

    async def run(self, token):
        service, repo = self.service, self.service.repository
        try:
            queue = [(key, None) for key in self.state["job_ids"]] + [
                (None, url) for url in self.state.get("job_urls", [])
            ]
            await service.activity.report(
                "opening",
                reset=True,
                current_index=0,
                total=len(queue),
                sent_count=0,
                target_count=self.state["target_count"],
            )
            search = None
            if self.state.get("source") == "search":

                async def progress(keyword, number, discovered):
                    self.update(
                        search_keyword=keyword,
                        search_page=number,
                        discovered_count=discovered,
                        message=f"正在搜索 {keyword}，第 {number} 页",
                    )
                    await service.activity.report(
                        "searching",
                        detail=self.state["message"],
                        sent_count=self.state["sent_count"],
                    )

                search = JobSearchAgent(
                    service.rpc,
                    repo.config().preferences.keywords,
                    self.state["max_search_pages"],
                    self.check,
                    progress,
                )

            async def candidates():
                if search:
                    async for candidate in search.candidates():
                        yield candidate
                else:
                    for candidate in queue:
                        yield candidate

            index = -1
            async for job_id, url in candidates():
                index += 1
                self.check()
                total = search.discovered if search else len(queue)
                self.update(
                    current_index=index + 1,
                    total=total,
                    discovered_count=total,
                    message=f"正在检查第 {index + 1}/{total} 个候选岗位",
                )
                await service.activity.report(
                    "opening", current_index=index + 1, total=total
                )
                if url:
                    # 导入的是候选链接，不代表已满足条件；先读取真实页面再分析。
                    await service.rpc.execute("OPEN_JOB", {"url": url})
                    await service.activity.report("reading")
                    page = await service.rpc.request(
                        BrowserReadRequest(command="GET_JOB_DETAIL", expected_url=url)
                    )
                    if page.url != url:
                        raise ValueError("候选岗位页面已变化，已停止")
                    if page.kind == "verification":
                        raise ValueError(page.notice or "平台需要人工验证")
                    if "已沟通过" in page.notice or "已关闭" in page.notice:
                        self.update(
                            items=self.state["items"]
                            + [
                                {
                                    "job_id": url,
                                    "status": "skipped",
                                    "reason": page.notice,
                                }
                            ]
                        )
                        continue
                    found = await service.discover(token)
                    if len(found) != 1:
                        raise ValueError("未取得唯一完整职位，已停止")
                    job_id = found[0]["job"]["id"]
                item = repo.job(job_id)
                if (
                    not item
                    or not item["job"]["detail_complete"]
                    or item["analysis"]["decision"] != "apply"
                ):
                    self.update(
                        items=self.state["items"]
                        + [
                            {
                                "job_id": job_id,
                                "status": "skipped",
                                "reason": "；".join(
                                    [item["analysis"]["reason"]]
                                    + item["analysis"].get("concerns", [])
                                )
                                if item
                                else "未找到完整岗位",
                                "company": item["job"]["company"] if item else "",
                            }
                        ]
                    )
                    continue
                if repo.application_for_job(job_id):
                    self.update(
                        items=self.state["items"]
                        + [
                            {
                                "job_id": job_id,
                                "status": "skipped",
                                "reason": "已存在投递记录，请在历史中处理",
                            }
                        ]
                    )
                    continue
                # 导航也是固定语义命令，只能打开数据库中已选中的岗位。
                if not url:
                    await service.rpc.execute("OPEN_JOB", {"url": item["job"]["url"]})
                self.check()
                record = await service.prepare(token, job_id)
                current = repo.job(job_id)
                if current["analysis"]["decision"] != "apply":
                    await service.approve(token, record["id"], Approval(approved=False))
                    raise ValueError("最新分析需要人工复核，已停止队列")
                self.check()
                record = await service.approve(
                    token, record["id"], Approval(approved=True)
                )
                self.update(
                    items=self.state["items"]
                    + [
                        {
                            "job_id": job_id,
                            "status": record["status"],
                            "company": record["company"],
                        }
                    ]
                )
                if record["status"] != "WAITING_REPLY":
                    raise ValueError(
                        record.get("error") or "投递未完成，请核对历史记录"
                    )
                await self.after_application(record, current["analysis"])
                if self.state["sent_count"] >= self.state["target_count"]:
                    break
                # 人工复盘时间计入投递间隔，避免检查完后再完整等待一次。
                # 最终发送前仍由 verify_application 按数据库中的尝试时间核验。
                if search or index < len(queue) - 1:
                    while True:
                        self.check()
                        elapsed = (
                            datetime.now(UTC)
                            - datetime.fromisoformat(record["contact_attempt_at"])
                        ).total_seconds()
                        remaining = repo.config().preferences.interval_seconds - elapsed
                        if remaining <= 0:
                            break
                        await service.activity.report(
                            "interval",
                            status="waiting",
                            detail=f"约 {int(remaining) + 1} 秒后检查下一岗",
                            sent_count=self.state["sent_count"],
                        )
                        await asyncio.sleep(min(1, remaining))
            reached = self.state["sent_count"] >= self.state["target_count"]
            self.update(
                status="completed",
                message="已达到本轮目标"
                if reached
                else (
                    f"本轮搜索已结束：{search.summary}；可调整关键词或搜索页数后重试"
                    if search
                    else "候选岗位已处理完，未达到目标可补充链接"
                ),
            )
            await service.activity.report(
                "completed",
                status="done",
                detail=self.state["message"],
                sent_count=self.state["sent_count"],
            )
        except asyncio.CancelledError:
            self.update(status="stopped", message="程序退出，未自动恢复队列")
            await service.activity.report(
                "stopped", status="done", detail=self.state["message"]
            )
            raise
        except Exception as error:  # noqa: BLE001 — 后台任务边界必须记录失败并停止队列
            service.agent.state["status"] = "paused"
            self.update(status="stopped", message=str(error)[:300])
            await service.activity.report(
                "stopped",
                status="done" if self.cancelled else "error",
                detail=self.state["message"],
            )
        finally:
            await self.publish()
            repo.event(
                "AUTO_FINISHED", self.state.get("id", "auto"), self.state["status"]
            )
