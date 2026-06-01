import pytest


@pytest.mark.asyncio
async def test_health_check(client):
    res = await client.get("/api/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert data["service"] == "RAG System API"
