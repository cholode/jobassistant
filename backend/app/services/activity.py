"""实时执行状态：仅发布操作摘要，不包含简历正文、模型提示词或密钥。"""

from ..browser.client import BrowserRPCError
from ..database.repository import now

LABELS = {
    "searching": "正在自主搜索职位",
    "planning": "正在规划分析步骤",
    "filter_job": "正在检查岗位硬条件",
    "recall_memory": "正在读取历史分析记忆",
    "analyze_job": "正在分析岗位匹配度",
    "reflect_decision": "正在复核分析与事实依据",
    "opening": "正在打开岗位",
    "reading": "正在读取职位详情",
    "approval": "等待确认沟通内容",
    "verifying": "正在核对岗位与投递条件",
    "contacting": "正在开始沟通并核对会话",
    "sending": "正在发送介绍并核对回执",
    "review": "等待本岗复盘",
    "interval": "等待下一次沟通间隔",
    "completed": "本轮任务已结束",
    "analyzed": "岗位分析已完成",
    "sent": "介绍已发送，等待招聘者回复",
    "stopped": "任务已停止",
    "error": "操作未完成，需要核对",
}


class ActivityService:
    def __init__(self, agent, rpc):
        self.agent, self.rpc = agent, rpc

    async def report(
        self, stage, job=None, *, status="working", detail="", reset=False, **progress
    ):
        previous = {} if reset else self.agent.state.get("activity") or {}
        # 不继承上一岗位身份；无 job 的步骤显式保留由队列传入的进度信息。
        identity = job.model_dump() if hasattr(job, "model_dump") else job or {}
        self.agent.state["activity"] = {
            **previous,
            "stage": stage,
            "label": LABELS.get(stage, "正在执行任务"),
            "status": status,
            "detail": detail[:300],
            "company": identity.get("company", ""),
            "title": identity.get("title", ""),
            "updated_at": now(),
            **progress,
        }
        self.agent.state["revision"] += 1
        try:
            await self.rpc.send(self.agent.event("agent_state"))
        except (BrowserRPCError, AttributeError):
            # 断线不改变业务结果；重连会从 Agent 状态快照恢复显示。
            pass
