"""POST /scans, GET /scans (+filters), GET /scans/{id}."""
from app.promote import REPORT_CAP

from .conftest import post_scan


async def test_create_scan_returns_record(client):
    resp = await post_scan(client, critical=0, high=2, medium=3, low=4, total=9,
                           report='{"Results": []}')
    assert resp.status_code == 201
    body = resp.json()
    assert body["id"] == 1
    assert body["image_name"] == "hello-app"
    assert body["registry"] == "dev"
    assert body["scanned_by"] == "tester"
    assert (body["critical"], body["high"], body["medium"], body["low"], body["total"]) == (0, 2, 3, 4, 9)
    assert body["passed"] is True
    assert body["report"] == '{"Results": []}'
    assert body["created_at"]


async def test_passed_computed_server_side_client_value_ignored(client):
    # Client claims passed=True with criticals — server overrules.
    resp = await post_scan(client, critical=5, passed=True)
    assert resp.json()["passed"] is False
    # And the inverse: client claims failed on a clean scan.
    resp = await post_scan(client, critical=0, passed=False)
    assert resp.json()["passed"] is True


async def test_passed_uses_max_critical_env(client, monkeypatch):
    monkeypatch.setenv("PROMOTION_MAX_CRITICAL", "3")
    assert (await post_scan(client, critical=3)).json()["passed"] is True
    assert (await post_scan(client, critical=4)).json()["passed"] is False


async def test_report_capped_at_200kb(client):
    resp = await post_scan(client, report="x" * (REPORT_CAP + 5000))
    assert resp.status_code == 201
    scan_id = resp.json()["id"]
    resp = await client.get(f"/scans/{scan_id}")
    assert len(resp.json()["report"]) == REPORT_CAP


async def test_unknown_registry_rejected(client):
    resp = await post_scan(client, registry="qa")
    assert resp.status_code == 422


async def test_list_newest_first_report_omitted(client):
    await post_scan(client, tag="v1.0.0", report='{"big": "blob"}')
    await post_scan(client, tag="v2.0.0", report='{"big": "blob"}')
    resp = await client.get("/scans")
    assert resp.status_code == 200
    items = resp.json()
    assert [i["tag"] for i in items] == ["v2.0.0", "v1.0.0"]
    assert all("report" not in i for i in items)


async def test_list_filters(client):
    await post_scan(client, image_name="hello-app", tag="latest", registry="dev")
    await post_scan(client, image_name="hello-app", tag="v1.0.0", registry="dev")
    await post_scan(client, image_name="other-app", tag="latest", registry="staging")

    resp = await client.get("/scans", params={"image_name": "hello-app"})
    assert len(resp.json()) == 2
    resp = await client.get("/scans", params={"tag": "latest"})
    assert len(resp.json()) == 2
    resp = await client.get("/scans", params={"registry": "staging"})
    assert len(resp.json()) == 1
    resp = await client.get("/scans", params={"image_name": "hello-app", "tag": "latest"})
    assert len(resp.json()) == 1


async def test_list_limit(client):
    for i in range(25):
        await post_scan(client, tag=f"v{i}")
    resp = await client.get("/scans")
    assert len(resp.json()) == 20  # contract default
    resp = await client.get("/scans", params={"limit": 5})
    assert len(resp.json()) == 5


async def test_get_scan_includes_report_and_404(client):
    resp = await post_scan(client, report='{"Results": [1, 2]}')
    scan_id = resp.json()["id"]
    resp = await client.get(f"/scans/{scan_id}")
    assert resp.status_code == 200
    assert resp.json()["report"] == '{"Results": [1, 2]}'

    resp = await client.get("/scans/9999")
    assert resp.status_code == 404
