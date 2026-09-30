"""只读浏览器协议；不接受脚本、选择器或点击坐标。"""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

BrowserCommandName = Literal["GET_PAGE_DATA", "GET_JOB_DETAIL", "GET_CHAT_MESSAGES"]


class BrowserReadRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    command: BrowserCommandName = "GET_PAGE_DATA"
    expected_url: str | None = Field(default=None, max_length=4096)


class JobSummary(BaseModel):
    id: str = Field(max_length=200)
    title: str = Field(max_length=500)
    company: str = Field(max_length=500)
    salary: str = Field(max_length=200)
    location: str = Field(max_length=500)
    url: str = Field(max_length=4096)
    tags: list[str] = Field(default_factory=list, max_length=30)
    description: str = Field(default="", max_length=12000)


class ChatMessage(BaseModel):
    sender: Literal["hr", "me", "unknown"]
    text: str = Field(max_length=4000)


class PageReading(BaseModel):
    url: str = Field(max_length=4096)
    title: str = Field(max_length=512)
    platform: Literal["mock", "generic"]
    kind: Literal["job_list", "job_detail", "chat", "unknown", "verification"]
    text: str = Field(max_length=20000)
    truncated: bool
    read_at: str = Field(max_length=64)
    jobs: list[JobSummary] = Field(default_factory=list, max_length=100)
    messages: list[ChatMessage] = Field(default_factory=list, max_length=100)
    notice: str = Field(default="", max_length=1000)
    operation: dict | None = None


class BrowserErrorData(BaseModel):
    code: str = Field(max_length=100)
    message: str = Field(max_length=1000)


class BrowserResult(BaseModel):
    type: Literal["browser_result"]
    request_id: str = Field(max_length=100)
    success: bool
    data: PageReading | None = None
    error: BrowserErrorData | None = None
