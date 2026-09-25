import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.main import create_app


@pytest.fixture
def client():
    with TestClient(create_app("test-secret")) as client:
        yield client


def test_health_and_http_auth(client):
    assert client.get("/health").json()["phase"] == 1
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
