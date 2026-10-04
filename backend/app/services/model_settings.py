"""本地模型设置：密钥只写入私有数据目录，接口永不回传密钥。"""

import json
import os
from pathlib import Path

from langchain_openai import ChatOpenAI
from pydantic import BaseModel, ConfigDict, Field, SecretStr, field_validator


class ModelSettings(BaseModel):
    model_config = ConfigDict(extra="forbid")
    base_url: str = Field(max_length=500)
    model: str = Field(min_length=1, max_length=150)
    api_key: SecretStr | None = None

    @field_validator("base_url")
    @classmethod
    def check_url(cls, value):
        from urllib.parse import urlsplit

        url = urlsplit(value)
        if not url.hostname:
            raise ValueError("模型地址缺少主机名")
        if url.username or url.password or url.query or url.fragment:
            raise ValueError("模型地址不能包含凭据、查询参数或片段")
        if url.scheme != "https" and not (
            url.scheme == "http" and url.hostname in {"localhost", "127.0.0.1"}
        ):
            raise ValueError("模型服务须为 HTTPS 或本机 HTTP")
        return value.rstrip("/")


class ModelSettingsService:
    def __init__(self, directory: Path):
        self.path = directory / "model-settings.json"
        if self.path.exists():
            data = json.loads(self.path.read_text(encoding="utf-8"))
            self._apply(data)

    @staticmethod
    def _apply(data):
        for key, value in data.items():
            if key in {"OPENAI_API_KEY", "OPENAI_BASE_URL", "JOB_AGENT_MODEL"}:
                os.environ[key] = value

    def state(self):
        return {
            "base_url": os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1"),
            "model": os.getenv("JOB_AGENT_MODEL", ""),
            "configured": bool(os.getenv("OPENAI_API_KEY")),
        }

    def save(self, value: ModelSettings):
        data = {
            "OPENAI_BASE_URL": value.base_url,
            "JOB_AGENT_MODEL": value.model,
            "OPENAI_API_KEY": value.api_key.get_secret_value()
            if value.api_key and value.api_key.get_secret_value().strip()
            else os.getenv("OPENAI_API_KEY", ""),
        }
        temporary = self.path.with_suffix(".tmp")
        temporary.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        temporary.replace(self.path)
        self._apply(data)
        return self.state()

    async def test(self):
        # 仅发送固定测试文本，失败不回显上游可能包含认证信息的响应。
        try:
            model = ChatOpenAI(
                model=os.environ["JOB_AGENT_MODEL"],
                base_url=os.getenv("OPENAI_BASE_URL"),
                timeout=25,
                max_retries=0,
            )
            await model.ainvoke("回复 OK，仅测试连接。")
            return {"ok": True, "message": "模型连接成功"}
        except Exception as error:  # noqa: BLE001 — 连接探测统一脱敏上游异常
            return {
                "ok": False,
                "message": f"模型连接失败（{type(error).__name__}），请检查地址、模型与密钥",
            }
