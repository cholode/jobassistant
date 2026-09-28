"""桌面通信的数据模型：负责字段类型、长度和指令范围校验。"""

from typing import Literal

from pydantic import BaseModel, Field


class PageState(BaseModel):
    # 只保存网页地址和标题，页面快照不包含 DOM 或职位正文。
    url: str = Field(default="", max_length=4096)
    title: str = Field(default="", max_length=512)


class ClientMessage(BaseModel):
    # 限制指令类型，用 request_id 将响应关联到桌面端发出的请求。
    type: Literal["pause", "resume", "start", "page", "ping"]
    request_id: str = Field(max_length=100)
    page: PageState | None = None
