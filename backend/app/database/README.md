# SQLite 仓库接口

`repository.Repository(directory: Path)` 创建目录及 `recruitment.db`，建立 jobs/applications/settings/events 四张表，以 JSON data 保存业务快照。应用表另有唯一 job_id，限制同一岗位重复建记录。无 config 时读取同目录 profile.json（完整 RecruitmentConfig 形状），否则使用默认配置；已有配置不重复导入。

| 方法 | 输入 → 返回 | 副作用 |
| --- | --- | --- |
| `config()` | 无 → RecruitmentConfig | 无 |
| `save_config(config)` | RecruitmentConfig → None | 覆盖 settings/config |
| `save_job(job, analysis)` | Job、JobDecision → dict | 保存 `{job, analysis, updated_at}` |
| `job(key)` | 岗位 ID → dict 或 None | 无 |
| `all(table)` | 本仓库 Table 对象 → list[dict] | 不承诺排序 |
| `application(key)` | 投递 ID → dict 或 None | 无 |
| `application_for_job(job_id)` | 岗位 ID → dict 或 None | 无 |
| `save_application(data)` | 含 id/job_id 的记录 → dict | 增加 updated_at 并按主键保存 |
| `event(kind, subject, details="")` | 事件类型/对象/详情 → None | 生成 UUID，写入 UTC time |
| `recover()` | 无 → None | 将 APPROVED/CONTACTING/CONTACTED/SENDING 置 UNCERTAIN |
| `now()` | 无 → str | UTC ISO 时间工具，无存储副作用 |

每次写入使用事务；没有跨整个投递流程的大事务。数据库约束、文件或 JSON 校验错误向上传播。Repository 不做身份认证；应由服务调用，不向前端暴露。使用完毕调用 `repository.engine.dispose()`（由招聘服务 close 负责）。

`workflow.db` 属于 LangGraph 检查点，`agent-memory.db` 属于 [Agent 记忆](../agents/README.md)，不由本仓库读写。调用流程见 [services](../services/README.md)。
