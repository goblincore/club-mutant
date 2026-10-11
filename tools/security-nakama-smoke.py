"""Exercise the real ES5 runtime against the disposable local Nakama test stack.

Start Nakama on 127.0.0.1:17350 with local-public-key / local-private-runtime-key.
Never run this against production: it creates a disposable account and playlist.
"""
import base64
import json
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:17350"


def request(path, method="GET", body=None, authorization=None):
    headers = {"Content-Type": "application/json"}
    if authorization:
        headers["Authorization"] = authorization
    req = urllib.request.Request(
        BASE + path,
        data=json.dumps(body).encode() if body is not None else None,
        method=method,
        headers=headers,
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            return response.status, json.loads(response.read() or b"{}")
    except urllib.error.HTTPError as error:
        return error.code, json.loads(error.read() or b"{}")


basic = "Basic " + base64.b64encode(b"local-public-key:").decode()
status, session = request(
    "/v2/account/authenticate/device?create=true",
    "POST",
    {"id": "security-test-device"},
    basic,
)
assert status == 200, (status, session)
bearer = "Bearer " + session["token"]

checks = [
    ("/v2/storage", "PUT", {"objects": [{"collection": "playlists", "key": "probe", "value": "{}", "permission_read": 1, "permission_write": 1}]}, 403),
    ("/v2/storage/delete", "PUT", {"object_ids": [{"collection": "playlists", "key": "probe"}]}, 403),
    ("/v2/storage", "PUT", {"objects": [{"collection": "user_settings", "key": "probe", "value": "{}", "permission_read": 2, "permission_write": 1}]}, 200),
    ("/v2/rpc/get_profile", "POST", "{}", 200),
    ("/v2/rpc/save_playlist", "POST", json.dumps({"id": "security-probe", "name": "Probe", "items": []}), 200),
    ("/v2/rpc/delete_playlist", "POST", json.dumps({"id": "security-probe"}), 200),
]
for path, method, body, expected in checks:
    status, result = request(path, method, body, bearer)
    assert status == expected, (path, status, result)
    print(method, path, status)

status, result = request("/v2/rpc/get_profile?http_key=local-private-runtime-key", "POST", "{}")
assert status == 401, (status, result)
print("Runtime key without user session", status)
