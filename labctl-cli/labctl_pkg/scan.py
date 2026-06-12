"""Trivy scanning: run the trivy client against the lab's trivy server,
parse severities, and record the result in the promotion service."""

import json

from . import env, proc, promotion
from .errors import LabError

SEVERITIES = ("CRITICAL", "HIGH", "MEDIUM", "LOW")
_MAX_REPORT_BYTES = 200_000  # promotion service truncates at 200 KB anyway


def trivy_argv(engine, image, tag, reg):
    """The exact client-mode trivy command (contract §7)."""
    target = "{}/{}:{}".format(env.REGISTRY_INTERNAL_HOSTS[reg], image, tag)
    return [
        engine, "run", "--rm", "--network", env.NETWORK,
        "aquasec/trivy:latest", "image",
        "--server", env.TRIVY_SERVER_URL,
        "--format", "json", "--insecure",
        target,
    ]


def parse_severities(report):
    counts = {sev: 0 for sev in SEVERITIES}
    total = 0
    for result in report.get("Results") or []:
        for vuln in result.get("Vulnerabilities") or []:
            total += 1
            sev = str(vuln.get("Severity") or "").upper()
            if sev in counts:
                counts[sev] += 1
    return counts, total


def run_scan(ctx, image, tag, reg):
    """Scan <image>:<tag> in registry <reg>; POST the record to /scans.

    Returns (counts, total, scan_record) — scan_record is the promotion
    service's response (authoritative `passed`).
    """
    if reg not in env.REGISTRY_NAMES:
        raise LabError("unknown registry '{}' (use dev|staging|prod)".format(reg))
    completed = proc.run_cmd(ctx, trivy_argv(ctx.cfg.engine, image, tag, reg))
    hint = ("is the trivy server running? try: {} compose --profile security up -d trivy "
            "(full tier starts it automatically)".format(ctx.cfg.engine))
    if completed.returncode != 0:
        tail = (completed.stderr or completed.stdout or "").strip().splitlines()
        tail = tail[-1] if tail else "no output"
        raise LabError("trivy scan failed ({}) — {}".format(tail, hint))

    out = completed.stdout or ""
    start = out.find("{")
    if start < 0:
        raise LabError("trivy produced no JSON output — {}".format(hint))
    try:
        report = json.loads(out[start:])
    except ValueError:
        raise LabError("could not parse trivy JSON output — {}".format(hint))

    counts, total = parse_severities(report)
    report_str = json.dumps(report)
    if len(report_str) > _MAX_REPORT_BYTES:
        report_str = report_str[:_MAX_REPORT_BYTES]

    record = promotion.post_scan(ctx, {
        "image_name": image,
        "tag": tag,
        "registry": reg,
        "scanned_by": "labctl",
        "critical": counts["CRITICAL"],
        "high": counts["HIGH"],
        "medium": counts["MEDIUM"],
        "low": counts["LOW"],
        "total": total,
        "passed": counts["CRITICAL"] == 0,  # server recomputes; sent for completeness
        "report": report_str,
    })
    return counts, total, record
