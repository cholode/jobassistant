"""投递图：等待人工确认后依次校验、沟通、发送，拒绝则直接结束。"""

from typing import TypedDict

from langgraph.graph import END, START, StateGraph
from langgraph.types import interrupt


class ApplicationState(TypedDict, total=False):
    # 图状态只保留业务记录引用，完整岗位与消息从数据库读取。
    application_id: str
    approved: bool


def build_application(service, checkpointer):
    """构建带持久化中断点的图，具体副作用和状态校验仍由服务执行。"""
    def approval(state):
        record = service.repository.application(state["application_id"])
        # 重放此节点只再次获取审批，不执行点击或发送。
        answer = interrupt(
            {
                "application_id": record["id"],
                "company": record["company"],
                "title": record["title"],
                "message": record["message"],
            }
        )
        return {"approved": bool(answer.get("approved"))}

    async def verify(state):
        await service.verify_application(state["application_id"])
        return {}

    async def contact(state):
        await service.contact(state["application_id"])
        return {}

    async def send(state):
        await service.send_greeting(state["application_id"])
        return {}

    def reject(state):
        service.set_status(state["application_id"], "REJECTED")
        return {}

    graph = StateGraph(ApplicationState)
    graph.add_node("approval", approval)
    graph.add_node("verify_page", verify)
    graph.add_node("contact_hr", contact)
    graph.add_node("send_greeting", send)
    graph.add_node("reject", reject)
    graph.add_edge(START, "approval")
    # 恢复审批后按用户选择分支，拒绝路径不会经过任何网页写入节点。
    graph.add_conditional_edges(
        "approval", lambda state: "verify_page" if state["approved"] else "reject"
    )
    graph.add_edge("verify_page", "contact_hr")
    graph.add_edge("contact_hr", "send_greeting")
    graph.add_edge("send_greeting", END)
    graph.add_edge("reject", END)
    return graph.compile(checkpointer=checkpointer)
