# Hands on the Wheel — Governing AI Agents Across Your DevOps Stack

A hands-on course where you build a **real, gated CI/CD pipeline** from an empty
Git repo to a rolled-back production deploy — first **by hand**, then by handing
the same job to an **AI agent** through MCP (Model Context Protocol) and learning
to supervise it. You finish able to do the work *and* to govern automation that
does the work for you.

> Core idea: **you cannot safely supervise automation you couldn't perform
> yourself.** Every module is taught by hand first, then by agent.

**Free and open.** Clone it, run it on your own machine, keep it forever — no
sign-up, no account, no fee. The whole lab and curriculum are open source.

---

## Who this is for

- Engineers and platform/DevOps practitioners who know containers and Git basics
  and want to (a) master a real promotion-and-security pipeline and (b) understand
  how AI agents fit into DevOps safely.
- Team leads evaluating "agentic DevOps" who need a concrete, runnable mental model
  instead of vendor slideware.

**Prerequisites:** comfort with a terminal, Git, and basic Docker concepts. No
prior MCP or AI-tooling knowledge assumed. Everything runs on your own laptop;
nothing is sent to a cloud you don't control.

---

## What you'll be able to do

By the end you can, by hand and by supervised agent:

1. Drive Git as an API and collaborate through a real server (Gitea).
2. Author a CI pipeline as code — test → build → push — and read a failing run.
3. Reason about artifacts: tags vs. **digests**, immutability, "build once, promote many."
4. Run real container security scans (Trivy) and enforce a **CVE policy gate**.
5. Promote an image **dev → staging → prod** through a flow gate and a
   **per-environment, digest-bound scan gate** — and explain why each boundary
   re-attests.
6. Deploy to an environment and verify health.
7. Roll back to a prior digest and reconstruct the audit trail.
8. Hand each of the above to an AI agent over MCP tools, and recognize when the
   agent is right, wrong, or being told what it wants to hear.

---

## Two ways to take it — pick your size

The course ships in two editions over the **same** backend. Start in Terminal,
upgrade to Studio whenever you want the visual + agent layer.

| | **Terminal edition** (CLI) | **Studio edition** (full GUI) |
|---|---|---|
| **You drive with** | `./labctl` + raw `git`/`curl`/`docker`/`skopeo` | Everything in Terminal **plus** a live **Pipeline Board** and an AI chat that runs the tools for you |
| **The "by hand" path** | ✅ all 7 modules | ✅ all 7 modules |
| **The "by agent" path** | — (concepts only) | ✅ watch an AI agent do each job over MCP, with side-by-side model comparison |
| **AI model needed** | None | Local (Ollama) or bring-your-own API key (Anthropic / OpenAI / Google) |
| **Footprint** | ~1.5 GB images · 8 GB RAM · no GPU | ~1.9 GB images + ~5 GB model · 16 GB RAM recommended |
| **Best for** | Practitioners who live in the terminal and want zero AI dependencies | Anyone who wants the visual pipeline and the AI-governance half of the course |
| **Setup** | `./scripts/2-setup.sh --tier=full --edition=cli` | `./scripts/2-setup.sh --tier=full --edition=gui` |

Both editions are the **full** tier (Git + CI runner + three registries +
promotion service + Trivy scanner). Tiers and editions are independent: tiers pick
which backing services run; the edition picks whether the GUI/agent layer is on.

---

## The seven modules

Each module: **read the concept → do it by hand → `./labctl check N` proves it →
(Studio) watch the agent do it → break-fix drill.**

| # | Module | You build / learn | Proof |
|---|--------|-------------------|-------|
| 1 | **Git as a system** | Clone, branch, commit, push through Gitea; collaborate via API | `check 1` — repo reachable, >1 commit |
| 2 | **CI as code** | Author `.gitea/workflows/ci.yml`; test → build → push to dev registry; read a failing run | `check 2` — workflow green, image in dev |
| 3 | **Artifacts & registries** | Tags vs digests; cut a human release tag; inspect manifests | `check 3` — a non-CI release tag exists |
| 4 | **Supply-chain security** | Trivy client/server scan; read a CVE report; record a verdict | `check 4` — latest scan passes (0 critical) |
| 5 | **Environments & promotion** | dev→staging→prod flow gate + **digest-bound, per-env scan gate**; promote the same bytes | `check 5` — present in staging & prod with audit rows |
| 6 | **Deploy & operate** | Run the promoted image; health checks; logs | `check 6` — container healthy on its port |
| 7 | **Day-2 ops** | Roll back to a prior digest; reconstruct the audit trail | `check 7` — rollback recorded |

**Break-fix drills** (real failures you diagnose and fix): a Dockerfile typo that
fails the build, an end-of-life base image that fails the CVE gate, and a failing
test that blocks promotion. These are where the lessons stick.

**The capstone:** with the AI agent (Studio), drive a full release — commit →
CI → scan → promote → deploy — then break something and have the agent help you
roll back. You grade yourself the whole way with `./labctl check`.

---

## How you prove you finished

There's no human grader. The lab verifies you:

```bash
./labctl check all      # seven modules, PASS/FAIL with a hint on each failure
```

All seven green = you ran a complete, gated, audited delivery lifecycle end to
end. (Course platforms can read these exit codes to issue a completion record.)

---

## Format

- **Self-paced**, ~3–5 focused hours for the by-hand path; another 1–2 hours for
  the agent path in Studio. Modules are independent enough to do over several
  sittings — the lab state persists.
- **Fully offline after setup.** Pull the images (and, for Studio, the model) once;
  after that the whole course runs with your network unplugged.
- Optional **live cohort** delivery (instructor-led, private group) is available on
  top of either edition.

---

## Get started

```bash
git clone https://github.com/stratione/mcp-lab.git
cd mcp-lab
# Terminal edition:
./scripts/2-setup.sh --tier=full --edition=cli
# …or Studio edition (visual + AI agent):
./scripts/2-setup.sh --tier=full --edition=gui

./labctl status        # confirm the lab is up
./labctl modules       # see the seven checks
```

Then open **[docs/CURRICULUM.md](CURRICULUM.md)** and start Module 1. New here?
**[docs/course-overview.md](course-overview.md)** shows the whole pipeline in one
picture.

---

## Want this run for your team?

This course is free and open. It's also a working window into how I approach
**AI agents in real DevOps systems** — gated pipelines, supply-chain security,
and handing an LLM real tools without handing over the keys.

I deliver it as a **hands-on workshop** — half-day or full-day, in person or
remote, tailored to your team's stack and tools. If your team is putting AI agents
near its delivery pipeline and you want them to do it with their hands on the
wheel:

👉 **[Connect with me on LinkedIn](https://www.linkedin.com/in/dr-noe-lorona-7198181a7/)** — I'm happy to talk through
what a session for your team would look like.

— *Dr. Noe Lorona*
