"""测试公共配置：为每个测试隔离本地数据目录。"""

import pytest


@pytest.fixture(autouse=True)
def isolated_data(tmp_path, monkeypatch):
    # 测试不读取用户本地简历，也不污染个人投递数据库。
    monkeypatch.setenv("JOB_AGENT_DATA_DIR", str(tmp_path))
