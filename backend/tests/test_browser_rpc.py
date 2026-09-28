"""验证请求关联和失败清理；不依赖真实招聘网站或模型服务。"""

import asyncio
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient

from app.browser.client import BrowserRPCClient, BrowserRPCError
from app.browser.protocol import BrowserReadRequest, BrowserResult
from app.main import create_app


class FakeSocket:
    def __init__(self):
        self.sent = asyncio.Queue()

    async def send_json(self, message):
        await self.sent.put(message)


def result(request_id, title="测试页面"):
    return BrowserResult.model_validate(
        {
            "type": "browser_result",
            "request_id": request_id,
            "success": True,
            "data": {
                "url": "http://127.0.0.1:8765/mock/",
                "title": title,
                "platform": "mock",
                "kind": "job_list",
                "text": "测试正文",
                "truncated": False,
                "read_at": "2026-09-28T00:00:00Z",
            },
        }
    )


@pytest.mark.asyncio
async def test_response_matching_and_late_result():
    rpc = BrowserRPCClient()
    socket = FakeSocket()
    rpc.attach(socket)
    first = asyncio.create_task(rpc.request(BrowserReadRequest()))
    first_command = await socket.sent.get()
    second = asyncio.create_task(rpc.request(BrowserReadRequest()))
    second_command = await socket.sent.get()
    assert first_command["request_id"] != second_command["request_id"]
    # 故意乱序返回，不能把另一个页面的数据交给错误的调用方。
    rpc.receive(result(second_command["request_id"], "第二个"))
    rpc.receive(result(first_command["request_id"], "第一个"))
    assert (await first).title == "第一个"
    assert (await second).title == "第二个"
    rpc.receive(result(first_command["request_id"], "重复结果"))
    assert rpc.pending == {}


@pytest.mark.asyncio
async def test_timeout_and_disconnect_cleanup():
    rpc = BrowserRPCClient(timeout=0.02)
    socket = FakeSocket()
    rpc.attach(socket)
    with pytest.raises(BrowserRPCError, match="超时") as caught:
        await rpc.request(BrowserReadRequest())
    assert caught.value.code == "TIMEOUT"
    expired = await socket.sent.get()
    rpc.receive(result(expired["request_id"]))
    assert rpc.pending == {}
    request = asyncio.create_task(rpc.request(BrowserReadRequest()))
    await socket.sent.get()
    rpc.detach(FakeSocket())  # 无关连接断开不能取消当前请求。
    assert not request.done()
    rpc.detach(socket)
    with pytest.raises(BrowserRPCError) as caught:
        await request
    assert caught.value.code == "DISCONNECTED"
    assert rpc.pending == {}
    with pytest.raises(BrowserRPCError):
        await rpc.request(BrowserReadRequest())


@pytest.mark.asyncio
async def test_browser_error_and_cancellation():
    rpc = BrowserRPCClient()
    socket = FakeSocket()
    rpc.attach(socket)
    request = asyncio.create_task(rpc.request(BrowserReadRequest()))
    command = await socket.sent.get()
    rpc.receive(
        BrowserResult(
            type="browser_result",
            request_id=command["request_id"],
            success=False,
            error={"code": "STALE_PAGE", "message": "页面已变化"},
        )
    )
    with pytest.raises(BrowserRPCError) as caught:
        await request
    assert caught.value.code == "STALE_PAGE"
    request = asyncio.create_task(rpc.request(BrowserReadRequest()))
    await socket.sent.get()
    request.cancel()
    with pytest.raises(asyncio.CancelledError):
        await request
    assert rpc.pending == {}


def test_http_auth_and_readonly_command_validation():
    with TestClient(create_app("test")) as client:
        assert client.post("/browser/read", json={}).status_code == 401
        headers = {"X-Job-Agent-Token": "test"}
        assert client.post("/browser/read", json={}, headers=headers).status_code == 503
        assert (
            client.post(
                "/browser/read", json={"command": "CLICK"}, headers=headers
            ).status_code
            == 422
        )
        assert (
            client.post(
                "/browser/read", json={"script": "alert(1)"}, headers=headers
            ).status_code
            == 422
        )


def test_http_to_websocket_roundtrip():
    with (
        TestClient(create_app("test")) as client,
        client.websocket_connect("/ws") as ws,
    ):
        ws.send_json({"token": "test"})
        ws.receive_json()
        with ThreadPoolExecutor() as pool:
            response = pool.submit(
                client.post,
                "/browser/read",
                json={},
                headers={"X-Job-Agent-Token": "test"},
            )
            command = ws.receive_json()
            assert command["type"] == "browser_command"
            # RPC 等待期间心跳仍须正常，证明接收循环没有被自身请求阻塞。
            ws.send_json({"type": "ping", "request_id": "heartbeat"})
            assert ws.receive_json()["type"] == "pong"
            ws.send_json(result(command["request_id"]).model_dump())
            http_response = response.result(timeout=3)
            assert http_response.status_code == 200
            assert http_response.json()["text"] == "测试正文"


def test_verification_read_pauses_agent():
    with (
        TestClient(create_app("test")) as client,
        client.websocket_connect("/ws") as ws,
    ):
        ws.send_json({"token": "test"})
        ws.receive_json()
        ws.send_json(
            {
                "type": "resume",
                "request_id": "start",
                "page": {"url": "https://www.zhipin.com/", "title": "验证"},
            }
        )
        assert ws.receive_json()["state"]["status"] == "running"
        with ThreadPoolExecutor() as pool:
            response = pool.submit(
                client.post,
                "/browser/read",
                json={},
                headers={"X-Job-Agent-Token": "test"},
            )
            command = ws.receive_json()
            verification = result(command["request_id"]).model_dump()
            verification["data"]["kind"] = "verification"
            ws.send_json(verification)
            assert ws.receive_json()["state"]["status"] == "paused"
            assert response.result(timeout=3).status_code == 200
