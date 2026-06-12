"""The ONE helper every labctl network call goes through.

`request()` echoes the raw, copy-pasteable `curl` equivalent of each call
when --verbose is on (prefix `→ raw: `). Tokens are NEVER printed — token
auth is echoed as `-H "Authorization: token $GITEA_TOKEN"` so the line still
works for anyone who has the token exported in their shell.

HTTP error statuses (4xx/5xx) are returned as normal Response objects so
callers can surface API details (e.g. promotion policy 409s). Connection
failures raise ServiceDown with a friendly "is the lab up?" hint.
"""

import base64
import json as jsonlib
import shlex
import socket
import urllib.error
import urllib.request

from . import render
from .errors import LabError

_MAX_INLINE_BODY = 2048


class ServiceDown(LabError):
    """A lab service did not answer at all (connection refused / timeout)."""


class Response:
    def __init__(self, status, headers, body):
        self.status = status
        self.headers = {str(k): str(v) for k, v in (headers or {}).items()}
        self.body = body or b""

    def header(self, name, default=""):
        for k, v in self.headers.items():
            if k.lower() == name.lower():
                return v
        return default

    def json(self):
        text = self.body.decode("utf-8", errors="replace") or "null"
        try:
            return jsonlib.loads(text)
        except ValueError:
            raise LabError("expected JSON but got: {}...".format(text[:120]))

    def detail(self):
        """Best-effort human message out of an API error body."""
        try:
            data = self.json()
            if isinstance(data, dict):
                return str(data.get("detail") or data.get("message") or data)
        except LabError:
            pass
        return self.body.decode("utf-8", errors="replace")[:200]


def _shquote(s):
    """Quote for the echoed curl line; keep $VARS expandable (double quotes)."""
    if s and all(ch.isalnum() or ch in "-_./:=@%+," for ch in s):
        return s
    if "$" in s:
        return '"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"'
    return shlex.quote(s)


def _curl_line(method, url, headers, data, auth):
    parts = ["curl", "-s"]
    if method == "HEAD":
        parts.append("-I")
    elif method != "GET":
        parts += ["-X", method]
    if auth:
        if auth[0] == "basic":
            # NEVER echo the real password — scrub it the same way the token
            # path scrubs the token (D-007).
            parts += ["-u", "{}:$GITEA_PASS".format(auth[1])]
        elif auth[0] == "token":
            # NEVER echo the real token.
            parts += ["-H", "Authorization: token $GITEA_TOKEN"]
    for key, value in (headers or {}).items():
        parts += ["-H", "{}: {}".format(key, value)]
    if data is not None:
        try:
            text = data.decode("utf-8")
            printable = "\n" not in text and len(text) <= _MAX_INLINE_BODY
        except UnicodeDecodeError:
            printable = False
        if printable:
            parts += ["-d", text]
        else:
            parts += ["--data-binary", "@body.json"]
    parts.append(url)
    return " ".join(_shquote(p) for p in parts)


def request(ctx, method, url, headers=None, json_body=None, data=None,
            auth=None, service=None, timeout=10):
    """Perform an HTTP request. Returns Response (even for 4xx/5xx).

    auth: None | ("basic", user, password) | ("token", token)
    json_body: object serialized as JSON (sets Content-Type)
    data: raw bytes body (callers set Content-Type via headers)
    """
    hdrs = {}
    if json_body is not None:
        data = jsonlib.dumps(json_body).encode("utf-8")
        hdrs["Content-Type"] = "application/json"
    hdrs.update(headers or {})

    render.echo_raw(ctx, _curl_line(method, url, hdrs, data, auth))

    req = urllib.request.Request(url, data=data, method=method)
    for key, value in hdrs.items():
        req.add_header(key, value)
    if auth:
        if auth[0] == "basic":
            creds = base64.b64encode("{}:{}".format(auth[1], auth[2]).encode()).decode()
            req.add_header("Authorization", "Basic " + creds)
        elif auth[0] == "token":
            req.add_header("Authorization", "token " + auth[1])

    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return Response(resp.status, dict(resp.headers), resp.read())
    except urllib.error.HTTPError as e:
        return Response(e.code, dict(e.headers or {}), e.read())
    except (urllib.error.URLError, ConnectionError, socket.timeout, OSError):
        name = service or url
        raise ServiceDown(
            "{} is not up ({}) — try: ./labctl up   (then check: ./labctl status)".format(name, url)
        )
