"""招聘数据契约：使用 Pydantic 校验输入，并统一各层传递的字段。"""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class Profile(BaseModel):
    """用户可向招聘方陈述的事实；空的可用时间表示尚未确认。"""

    model_config = ConfigDict(extra="forbid")
    name: str = Field(default="", max_length=100)
    skills: list[str] = Field(
        default_factory=lambda: ["Go", "MySQL", "Redis"], max_length=50
    )
    facts: list[str] = Field(default_factory=list, max_length=30)
    days_per_week: int | None = Field(default=None, ge=1, le=7)
    months: int | None = Field(default=None, ge=1, le=36)
    arrival_date: str | None = Field(default=None, max_length=50)

    @field_validator("skills", "facts")
    @classmethod
    def clean_text(cls, value):
        if any(len(item) > 1500 for item in value):
            raise ValueError("每条技能或经历不能超过1500字")
        return list(dict.fromkeys(item.strip() for item in value if item.strip()))


class Preferences(BaseModel):
    """筛选条件与执行频率；经验使用月数，薪资使用元/月。"""

    model_config = ConfigDict(extra="forbid")
    keywords: list[str] = Field(default_factory=lambda: ["Go", "Golang"], max_length=20)
    cities: list[str] = Field(default_factory=list, max_length=30)
    max_experience_months: int = Field(default=12, ge=0, le=120)
    employment: list[Literal["internship", "full_time"]] = Field(
        default_factory=lambda: ["internship", "full_time"]
    )
    blacklist: list[str] = Field(default_factory=list, max_length=100)
    minimum_monthly_salary: int = Field(default=0, ge=0)
    daily_limit: int = Field(default=3, ge=1, le=20)
    interval_seconds: int = Field(default=30, ge=0, le=3600)

    @field_validator("keywords", "cities", "blacklist")
    @classmethod
    def clean_text(cls, value):
        return list(dict.fromkeys(item.strip() for item in value if item.strip()))


class RecruitmentConfig(BaseModel):
    """一次完整配置；投递审批会绑定它的指纹，防止使用过期资料。"""

    model_config = ConfigDict(extra="forbid")
    profile: Profile = Field(default_factory=Profile)
    preferences: Preferences = Field(default_factory=Preferences)
    analysis_mode: Literal["rules", "llm"] = "rules"


class Job(BaseModel):
    """规范化岗位；id 标识岗位，fingerprint 检测内容是否变化。"""

    id: str
    platform: str
    source_id: str
    url: str
    title: str
    company: str
    location: str
    salary: str
    description: str
    tags: list[str]
    experience_months: int | None = None
    salary_min_monthly: int | None = None
    employment: Literal["internship", "full_time", "unknown"] = "unknown"
    detail_complete: bool = False
    fingerprint: str


class JobDecision(BaseModel):
    """分析结果；evidence_ids 是 Profile.facts 的从零开始的索引。"""

    decision: Literal["apply", "skip", "review"]
    match_score: int = Field(ge=0, le=100)
    strengths: list[str]
    concerns: list[str]
    reason: str
    source: Literal["rules", "llm"] = "rules"
    matched_skills: list[str] = Field(default_factory=list)
    evidence_ids: list[int] = Field(default_factory=list)


class Approval(BaseModel):
    """人工审批输入；message 为空值时保留已有招呼语。"""

    model_config = ConfigDict(extra="forbid")
    approved: bool
    message: str | None = Field(default=None, min_length=1, max_length=1500)
