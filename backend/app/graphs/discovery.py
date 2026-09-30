"""职位发现图：读取当前页面，去重并分析岗位，再保存结果。"""

from typing import TypedDict

from langgraph.graph import END, START, StateGraph

from ..browser.protocol import BrowserReadRequest, PageReading
from ..jobs.models import Job
from ..jobs.parser import parse_job


class DiscoveryState(TypedDict, total=False):
    page: dict
    records: list[dict]


def build_discovery(rpc, repository, agent):
    """仅处理当前已加载的职位，不自动翻页或打开其他职位。"""
    async def fetch(_state):
        page = await rpc.request(BrowserReadRequest())
        return {"page": page.model_dump()}

    async def evaluate(state):
        page = PageReading.model_validate(state["page"])
        if page.kind == "verification":
            raise ValueError("请先手动完成网页验证")
        if not page.jobs:
            raise ValueError("当前页面没有已适配的职位；请打开模拟职位列表或详情页")
        config = repository.config()
        records, seen = [], set()
        for summary in page.jobs[:30]:
            job = parse_job(summary, page.platform, page.kind == "job_detail")
            if job.id in seen:
                continue
            seen.add(job.id)
            # 列表字段不足时只做初筛；不覆盖已经提取的完整详情。
            existing = repository.job(job.id)
            if (
                not job.detail_complete
                and existing
                and existing["job"]["detail_complete"]
            ):
                # 保留完整详情，但使用当前地址及最新用户配置重新分析。
                job = Job.model_validate(existing["job"]).model_copy(
                    update={"url": job.url}
                )
            decision = await agent.evaluate(job, config)
            records.append(repository.save_job(job, decision))
            repository.event("JOB_EVALUATED", job.id, decision.decision)
        return {"records": records}

    graph = StateGraph(DiscoveryState)
    graph.add_node("fetch_jobs", fetch)
    graph.add_node("deduplicate_filter_evaluate_persist", evaluate)
    graph.add_edge(START, "fetch_jobs")
    graph.add_edge("fetch_jobs", "deduplicate_filter_evaluate_persist")
    graph.add_edge("deduplicate_filter_evaluate_persist", END)
    return graph.compile()
