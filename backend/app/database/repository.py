"""SQLite 数据访问层：统一保存业务快照，并处理执行中断后的状态恢复。"""

import json
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from sqlalchemy import (
    JSON,
    Column,
    MetaData,
    String,
    Table,
    create_engine,
    insert,
    select,
    update,
)

from ..jobs.models import RecruitmentConfig


def now() -> str:
    return datetime.now(UTC).isoformat()


class Repository:
    """业务数据与图检查点分开存储；此类不保存 LangGraph 内部状态。"""

    def __init__(self, directory: Path):
        directory.mkdir(parents=True, exist_ok=True)
        self.engine = create_engine(f"sqlite:///{directory / 'recruitment.db'}")
        meta = MetaData()
        self.jobs = Table(
            "jobs",
            meta,
            Column("id", String, primary_key=True),
            Column("data", JSON, nullable=False),
        )
        self.applications = Table(
            "applications",
            meta,
            Column("id", String, primary_key=True),
            Column("job_id", String, unique=True, nullable=False),
            Column("data", JSON, nullable=False),
        )
        self.settings = Table(
            "settings",
            meta,
            Column("id", String, primary_key=True),
            Column("data", JSON, nullable=False),
        )
        self.events = Table(
            "events",
            meta,
            Column("id", String, primary_key=True),
            Column("data", JSON, nullable=False),
        )
        meta.create_all(self.engine)
        # 本地个人材料可放 private/profile.json，仓库中不写入姓名、简历或联系方式。
        if self._get(self.settings, "config") is None:
            config = RecruitmentConfig()
            seed = directory / "profile.json"
            if seed.exists():
                config = RecruitmentConfig.model_validate(
                    json.loads(seed.read_text(encoding="utf-8"))
                )
            self.save_config(config)

    def _get(self, table, key):
        with self.engine.connect() as conn:
            return conn.execute(
                select(table.c.data).where(table.c.id == key)
            ).scalar_one_or_none()

    def _put(self, table, key, data):
        """在事务内按主键插入或更新；投递表另以 job_id 限制重复记录。"""
        with self.engine.begin() as conn:
            if conn.execute(select(table.c.id).where(table.c.id == key)).first():
                conn.execute(update(table).where(table.c.id == key).values(data=data))
            else:
                values = {"id": key, "data": data}
                if table is self.applications:
                    values["job_id"] = data["job_id"]
                conn.execute(insert(table).values(**values))

    def config(self):
        return RecruitmentConfig.model_validate(self._get(self.settings, "config"))

    def save_config(self, config):
        self._put(self.settings, "config", config.model_dump())

    def save_job(self, job, analysis):
        data = {
            "job": job.model_dump(),
            "analysis": analysis.model_dump(),
            "updated_at": now(),
        }
        self._put(self.jobs, job.id, data)
        return data

    def job(self, key):
        return self._get(self.jobs, key)

    def all(self, table):
        with self.engine.connect() as conn:
            return list(conn.execute(select(table.c.data)).scalars())

    def application(self, key):
        return self._get(self.applications, key)

    def application_for_job(self, job_id):
        with self.engine.connect() as conn:
            return conn.execute(
                select(self.applications.c.data).where(
                    self.applications.c.job_id == job_id
                )
            ).scalar_one_or_none()

    def save_application(self, data):
        data = {**data, "updated_at": now()}
        self._put(self.applications, data["id"], data)
        return data

    def event(self, kind, subject, details=""):
        self._put(
            self.events,
            str(uuid4()),
            {"kind": kind, "subject": subject, "details": details, "time": now()},
        )

    def recover(self):
        """将中断的执行标为结果不确定，保留待审批记录供用户恢复。"""
        # 崩溃时可能已经点击或发送，不能将未收到回执当成未执行而重试。
        for record in self.all(self.applications):
            if record["status"] in {"CONTACTING", "SENDING", "APPROVED", "CONTACTED"}:
                self.save_application(
                    {
                        **record,
                        "status": "UNCERTAIN",
                        "error": "上次执行被中断，请手动检查聊天，禁止自动重发",
                    }
                )
