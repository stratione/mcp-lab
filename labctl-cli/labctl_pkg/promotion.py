"""Promotion-service client: promote / rollback / scans / policy."""

from urllib.parse import urlencode

from . import http
from .errors import LabError

SERVICE = "promotion-service"


def _url(ctx, path):
    return ctx.cfg.promotion_url + path


def get_policy(ctx):
    resp = http.request(ctx, "GET", _url(ctx, "/policy"), service=SERVICE)
    if resp.status != 200:
        raise LabError("policy fetch failed (HTTP {}): {}".format(resp.status, resp.detail()))
    return resp.json()


def promote(ctx, image_name, tag, from_registry, to_registry, promoted_by):
    return http.request(ctx, "POST", _url(ctx, "/promote"), json_body={
        "image_name": image_name,
        "tag": tag,
        "promoted_by": promoted_by,
        "from_registry": from_registry,
        "to_registry": to_registry,
    }, service=SERVICE, timeout=60)


def rollback(ctx, image_name, tag, environment, rolled_back_by):
    return http.request(ctx, "POST", _url(ctx, "/rollback"), json_body={
        "image_name": image_name,
        "tag": tag,
        "environment": environment,
        "rolled_back_by": rolled_back_by,
    }, service=SERVICE, timeout=60)


def list_promotions(ctx):
    resp = http.request(ctx, "GET", _url(ctx, "/promotions"), service=SERVICE)
    if resp.status != 200:
        raise LabError("promotions fetch failed (HTTP {}): {}".format(resp.status, resp.detail()))
    return resp.json() or []


def list_scans(ctx, image_name="", tag="", registry="", limit=20):
    params = {"limit": limit}
    for key, value in (("image_name", image_name), ("tag", tag), ("registry", registry)):
        if value:
            params[key] = value
    resp = http.request(ctx, "GET", _url(ctx, "/scans?" + urlencode(params)), service=SERVICE)
    if resp.status != 200:
        raise LabError("scans fetch failed (HTTP {}): {}".format(resp.status, resp.detail()))
    return resp.json() or []


def get_scan(ctx, scan_id):
    resp = http.request(ctx, "GET", _url(ctx, "/scans/{}".format(scan_id)), service=SERVICE)
    if resp.status == 404:
        raise LabError("scan {} not found — see: ./labctl scans".format(scan_id))
    if resp.status != 200:
        raise LabError("scan fetch failed (HTTP {}): {}".format(resp.status, resp.detail()))
    return resp.json()


def post_scan(ctx, payload):
    resp = http.request(ctx, "POST", _url(ctx, "/scans"), json_body=payload,
                        service=SERVICE, timeout=30)
    if resp.status != 201:
        raise LabError("recording scan failed (HTTP {}): {}".format(resp.status, resp.detail()))
    return resp.json()
