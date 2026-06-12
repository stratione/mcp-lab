# labctl — the CLI edition of the MCP DevOps lab

Pure-stdlib Python (≥ 3.9), zero dependencies, nothing to install.

```sh
./labctl/labctl status        # from the repo root
python3 labctl status         # equivalent
# optional: ln -s "$(pwd)/labctl/labctl" ~/.local/bin/labctl
```

> Note: the contract sketched a root-level `./labctl` file, but `labctl/` must
> be a directory (tests live here: `make test-labctl` → `cd labctl && pytest`),
> so the launcher is `labctl/labctl` instead.

## The `--verbose` philosophy

labctl is a teaching tool, not an abstraction. **Every** network call and
**every** container-engine call funnels through one helper each, and with
`-v/--verbose` that helper prints the exact raw equivalent first:

```
$ ./labctl/labctl -v images
→ raw: curl -s http://localhost:5001/v2/_catalog
IMAGE (dev registry)
...
$ ./labctl/labctl -v scan hello-app:latest
→ raw: docker run --rm --network mcp-lab-net aquasec/trivy:latest image --server http://trivy:8080 --format json --insecure registry-dev:5000/hello-app:latest
→ raw: curl -s -X POST -H 'Content-Type: application/json' -d '{...}' http://localhost:8002/scans
```

Each echoed line is genuinely copy-pasteable — run it yourself and you get the
same result labctl got. Do every module by hand first; labctl is the shortcut
you earn afterwards. Tokens are never printed (auth is echoed as
`-H "Authorization: token $GITEA_TOKEN"`).

Global flags: `-v/--verbose`, `--json` (raw JSON on list/get commands),
`--engine docker|podman` (default: `CONTAINER_ENGINE` from `.env`, else
auto-detect). Colors honor `NO_COLOR` and non-TTY output.

## Command reference

| Command | What it does |
|---|---|
| `status` | Probe every lab service (HTTP health) + `engine ps` |
| `up [--tier=…] [--edition=…]` / `down` / `reset` | Wrap `scripts/2-setup.sh` / `compose down` / `scripts/3-teardown.sh` |
| `repos` | List Gitea repositories |
| `runs <repo> [--watch]` | Show CI runs; `--watch` polls until the latest run finishes |
| `ci init [repo]` | Commit the canonical `.gitea/workflows/ci.yml` (contents API, sha-aware) |
| `images [-r dev\|staging\|prod]` | Registry catalog |
| `tags <image> [-r …]` | Tags for an image |
| `retag <image>:<tag> <newtag> [-r …]` | Registry-native retag (manifest GET + re-PUT, docker v2 + OCI) |
| `scan <image>:<tag> [-r dev]` | Trivy client → lab trivy server; records the result in the promotion service |
| `scans` / `scan-report <id>` | Scan audit list / one full report |
| `promote <image>:<tag> --to staging\|prod [--by …]` | Promote (source derived from `policy`) |
| `promotions` / `policy` | Audit log / active policy gates |
| `rollback <image> --env staging\|prod` | Re-copy the previous promoted digest |
| `deploy <image>:<tag> --env dev\|staging\|prod` | Pull from that env's registry and run `mcp-lab-app-<env>` (ports 9080/9081/9082) |
| `deployments` / `applogs <env>` / `undeploy <env>` | Inspect / tail / remove deployments |
| `break <scenario>` / `fix <scenario>` / `scenarios` | Teaching failures: `dockerfile-typo`, `failing-test`, `vulnerable-base` |
| `check <module\|all>` / `modules` | Verify curriculum modules 1–7 (exit code = number of failures) |

## Tests

```sh
cd labctl && python3 -m pytest -v      # also: make test-labctl
```

Stdlib `http.server` fakes stand in for Gitea, the registries, and the
promotion service; the subprocess helper is monkeypatched — no containers
needed.
