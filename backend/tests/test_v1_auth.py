"""Auth guard on the /v1 admin endpoints (the fix for the public-admin hole)."""

# A representative protected endpoint from each protected router.
PROTECTED_ENDPOINTS = [
    "/api/v1/stores",        # v1_sales
    "/api/v1/workers",       # v1_staff
    "/api/v1/categories",    # v1_catalog
    "/api/v1/warehouses",    # v1_inventory
]


async def test_protected_endpoint_returns_401_without_token(client):
    resp = await client.get("/api/v1/stores")
    assert resp.status_code == 401


async def test_protected_endpoint_returns_200_with_token(client, worker_token):
    resp = await client.get(
        "/api/v1/stores", headers={"Authorization": f"Bearer {worker_token}"}
    )
    assert resp.status_code == 200
    assert "data" in resp.json()


async def test_all_protected_routers_require_auth(client):
    for path in PROTECTED_ENDPOINTS:
        resp = await client.get(path)
        assert resp.status_code == 401, f"{path} should require auth, got {resp.status_code}"


async def test_bearer_token_unlocks_all_protected_routers(client, worker_token):
    headers = {"Authorization": f"Bearer {worker_token}"}
    for path in PROTECTED_ENDPOINTS:
        resp = await client.get(path, headers=headers)
        assert resp.status_code == 200, f"{path} should be reachable with token, got {resp.status_code}"


async def test_invalid_token_is_rejected(client):
    resp = await client.get(
        "/api/v1/stores", headers={"Authorization": "Bearer not-a-real-jwt"}
    )
    assert resp.status_code == 401


async def test_login_with_bad_password_is_401(client, worker_token):
    resp = await client.post(
        "/api/v1/sessions",
        json={"data": {"attributes": {"username": "admin", "password": "wrong"}}},
    )
    assert resp.status_code == 401


async def test_sessions_endpoint_stays_public(client, worker_token):
    """The login endpoint itself must never require a token."""
    resp = await client.post(
        "/api/v1/sessions",
        json={"data": {"attributes": {"username": "admin", "password": "secret123"}}},
    )
    assert resp.status_code == 200
