import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.main import create_app


@pytest.fixture
def client():
    with TestClient(create_app("test-secret")) as client:
        yield client


def test_health_and_http_auth(client):
    assert client.get("/health").json()["phase"] == 4
    assert client.get("/agent/state").status_code == 401
    assert (
        client.get("/agent/state", headers={"X-Job-Agent-Token": "test-secret"}).json()[
            "status"
        ]
        == "paused"
    )
    assert client.get("/mock/").status_code == 200


def test_pause_resume_refresh_and_disconnect(client):
    with client.websocket_connect("/ws") as ws:
        ws.send_json({"token": "test-secret"})
        assert ws.receive_json()["state"]["status"] == "paused"
        ws.send_json({"type": "resume", "request_id": "1"})
        assert ws.receive_json()["type"] == "error"
        ws.send_json(
            {
                "type": "resume",
                "request_id": "2",
                "page": {"url": "https://example.com/job", "title": "Job"},
            }
        )
        resumed = ws.receive_json()
        assert resumed["request_id"] == "2"
        assert resumed["state"]["status"] == "running"
        ws.send_json({"type": "pause", "request_id": "3"})
        assert ws.receive_json()["state"]["status"] == "paused"
        ws.send_json(
            {
                "type": "resume",
                "request_id": "4",
                "page": {"url": "https://example.com/other", "title": "Other"},
            }
        )
        assert ws.receive_json()["state"]["page"]["title"] == "Other"
        ws.send_json({"type": "ping", "request_id": "5"})
        assert ws.receive_json()["type"] == "pong"
    assert (
        client.get("/agent/state", headers={"X-Job-Agent-Token": "test-secret"}).json()[
            "status"
        ]
        == "paused"
    )


def test_invalid_auth_and_origin(client):
    with pytest.raises(WebSocketDisconnect), client.websocket_connect("/ws") as ws:
        ws.send_json({"token": "wrong"})
        ws.receive_json()
    with (
        pytest.raises(WebSocketDisconnect),
        client.websocket_connect(
            "/ws", headers={"Origin": "https://untrusted.example"}
        ),
    ):
        pass


def test_app_instances_keep_state_and_auth_separate():
    # 服务从闭包迁移为类后，各应用仍应独立保存令牌、连接和运行状态。
    with (
        TestClient(create_app("first")) as first,
        TestClient(create_app("second")) as second,
        first.websocket_connect("/ws") as ws,
    ):
        ws.send_json({"token": "first"})
        ws.receive_json()
        ws.send_json(
            {
                "type": "resume",
                "request_id": "1",
                "page": {"url": "https://example.com/job", "title": "Job"},
            }
        )
        assert ws.receive_json()["state"]["status"] == "running"
        assert (
            second.get(
                "/agent/state", headers={"X-Job-Agent-Token": "first"}
            ).status_code
            == 401
        )
        state = second.get(
            "/agent/state", headers={"X-Job-Agent-Token": "second"}
        ).json()
        assert state["status"] == "paused"
        assert state["revision"] == 0
        assert state["page"] == {"url": "", "title": ""}
        with second.websocket_connect("/ws") as other_ws:
            other_ws.send_json({"token": "second"})
            assert other_ws.receive_json()["type"] == "connected"
