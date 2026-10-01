"""工具注册与调用：强制参数校验、超时及只读边界，不开放任意函数执行。"""

import asyncio
from collections.abc import Awaitable, Callable
from dataclasses import dataclass

from pydantic import BaseModel, ConfigDict

from .context import AgentContext


class EmptyArguments(BaseModel):
    model_config = ConfigDict(extra="forbid")


@dataclass(frozen=True)
class Tool:
    name: str
    description: str
    arguments: type[BaseModel]
    handler: Callable[[AgentContext, BaseModel], Awaitable[dict]]
    read_only: bool = True
    timeout: float = 45


class ToolRegistry:
    def __init__(self):
        self._tools: dict[str, Tool] = {}

    def register(self, tool: Tool) -> None:
        if tool.name in self._tools:
            raise ValueError(f"工具已注册：{tool.name}")
        if tool.timeout <= 0:
            raise ValueError("工具超时必须大于零")
        self._tools[tool.name] = tool

    def schemas(self) -> list[dict]:
        """规划器只看到可用工具描述和参数结构，不持有底层浏览器。"""
        return [
            {
                "name": t.name,
                "description": t.description,
                "parameters": t.arguments.model_json_schema(),
            }
            for t in self._tools.values()
            if t.read_only
        ]

    async def call(self, name: str, arguments: dict, context: AgentContext) -> dict:
        tool = self._tools.get(name)
        if tool is None:
            raise ValueError(f"未注册的工具：{name}")
        # 自动分析执行器永远不能绕过现有投递图的人工审批。
        if not tool.read_only:
            raise ValueError("写入工具必须通过独立的人工审批工作流执行")
        validated = tool.arguments.model_validate(arguments)
        async with asyncio.timeout(tool.timeout):
            return await tool.handler(context, validated)
