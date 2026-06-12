# KubeCon + CloudNativeCon North America 2026 — CFP Submission

**Event:** KubeCon + CloudNativeCon North America 2026 · Salt Lake City, UT · November 9–12, 2026
**CFP closes:** Sunday, May 31, 2026, 11:59 PM Mountain Time (UTC‑7)
**Submission portal:** https://sessionize.com/kubecon-cloudnativecon-north-america-2026/

> Paste-ready content for each Sessionize field. Confirm the exact track/format
> wording against the live submission form before submitting — KubeCon renames
> these slightly each cycle.

---

## Session Title

**Hands on the Wheel: Governing AI Agents Across Your DevOps Stack with MCP**

*Backup titles (if a co-presenter or committee wants a swap):*
- From Prompt to Production, Under Control: Governing Agentic DevOps with MCP
- Who Gave the AI Root? Scoped, Auditable DevOps Automation with the Model Context Protocol
- Hand the AI the Keys, Keep the Brakes: Governing Model-Driven DevOps with MCP

---

## Session Format

**Open to either: a full session presentation (solo) OR a lightning talk.**
The full session is the primary ask, but the core narrative compresses cleanly
to a 5-minute lightning talk if scheduling is tight.

> If the live form makes you pick one format, select the full session and note
> the lightning-talk openness in Notes to Committee (already drafted below).
> The material is also built on a fully containerized, runnable lab, so it can
> additionally be delivered as a hands-on lab / tutorial if the committee
> prefers that format.

---

## Track / Topic

- **Primary:** AI + ML
- **Secondary (if a second track is allowed):** Platform Engineering — or CI/CD + GitOps / Software Supply Chain Security, depending on what the committee surfaces

---

## Audience Experience Level

**Intermediate.** Attendees should be comfortable with containers, a CI/CD or
GitOps mental model, and the idea of an LLM "agent." No prior Model Context
Protocol (MCP) experience required — the talk teaches it.

---

## Elevator Pitch (public, ~400 characters)

> Two versions below. **Recommended: Option A** — it fits the ~400-char field and
> hooks harder. Option B is the Dr. Lorona–voice rewrite but runs ~600 chars, so
> it likely exceeds the form limit and needs trimming first.

**Option A — punchy (recommended, fits the limit):**

Everyone wants AI agents in their pipelines. Nobody wants an LLM with
unscoped access to prod. This talk shows how the Model Context Protocol (MCP)
lets an agent operate across your entire DevOps stack — source control,
registries, image promotion, user management — while you keep tools scoped,
actions auditable, and a human on the brakes. Live demo, all open source.

**Option B — Dr. Lorona voice (trim before using):**

The pervasive interest in integrating AI agents into software development
pipelines is evident; the prospect of an LLM with unrestrained access to
production is not. This session elucidates how the Model Context Protocol (MCP)
enables agent operation across the complete DevOps stack — source control,
registries, image promotion, and user management — while preserving stringent
control over tool scoping, action auditability, and human oversight. A live,
open-source demonstration underscores the approach.

---

## Description (public abstract)

> Final version below — 998 characters, fits the organizer's 1000-char limit,
> no em dashes or special arrows (encoding-safe), format-neutral (works as a
> full session, lightning talk, or poster). Paste as-is.

"Just let the AI do it" is a great demo and a terrible production strategy;
until you can answer the operator's real question: what is this agent allowed
to touch, and can I see everything it did?

The Model Context Protocol (MCP) is the open standard that makes agentic DevOps
governable. Instead of handing a model a shell, MCP exposes your systems as
typed, scoped, observable tools.

This session walks through one MCP server driving a miniature DevOps stack:
source control, container registries, and dev-to-prod image promotion via the
Registry v2 API. Then we focus on the part most talks skip: control and
visibility. We bound blast radius with capability switches, constrain inputs
with schemas, keep an audit trail of every call, and hold a human-in-the-loop
stop. The agent runs against a local open-source model (Ollama); nothing is
tied to one vendor or cloud.

Everything is open source and runs on your laptop. You'll leave knowing how to
expose your own systems as safe agent tools.

> Poster variant: swap "This session walks through" → "This poster shows" and
> "the part most talks skip" → "the part most projects skip."

---

## Key Takeaways (benefits to the ecosystem)

1. **What MCP really is** — tools, schemas, and transports — and why it's a
   better integration surface for agents than scripts, shells, or bespoke glue.
2. **A repeatable pattern** for exposing existing systems (Git, registries,
   internal APIs) as scoped, typed agent tools using an open-source MCP server.
3. **Concrete governance controls** — capability feature-switches to bound blast
   radius, schema-enforced inputs, auditable per-call visibility, and
   human-in-the-loop interrupts.
4. **Model-agnostic, local-first** — the same setup driven by a local open model
   (Ollama) or any hosted provider, with no lock-in.
5. **A runnable artifact** — an open-source Docker Compose lab attendees can
   clone, run offline, and adapt to their own DevOps environment the same week.

---

## Notes to Program Committee (private)

- **Not a vendor pitch.** MCP is treated as an open protocol; every component is
  open source (Gitea, Docker Registry v2, Ollama, FastAPI, FastMCP). The material
  is model-agnostic and runs entirely on a laptop — no SaaS, no signup, no
  product. It maps directly onto CNCF concerns: supply-chain promotion gates,
  least-privilege access, and observability of automated actors.
- **Publicly available.** The entire project is public and free for attendees to
  use, run, and train on — so the session doubles as durable teaching material
  the community keeps after the conference.
- **Format flexibility.** I'm happy to present this as a full session or, if
  scheduling is tight, as a lightning talk — the core narrative (govern an agent
  across a real DevOps stack with MCP) compresses well to 5 minutes. The same
  runnable lab can also be delivered as a hands-on tutorial/lab if the committee
  would rather schedule it that way.
- **Built on a real, de-risked lab.** This is backed by a working environment — 8
  containerized services orchestrated by Docker Compose, with an MCP server that
  exposes ~20 tools across source control, registry, promotion, and identity.
  It already runs offline against a local model, so anything shown does not depend
  on conference Wi-Fi or a third-party API.
- **Why now.** Teams are racing to put agents into delivery pipelines and
  hitting the governance wall hard. The community needs less "agents are
  magic" and more "here's how to bound and audit one." This talk is squarely the
  latter.
- **Why me.** I built the lab and have run it as a hands-on DevOps workshop, so
  the material is battle-tested in front of practitioners and adapts to a full
  session, a lightning talk, or a poster.
- **Backup plan.** Every step has a pre-recorded fallback clip and the poster/
  slides carry the narrative, so nothing depends on live execution.

---

## Speaker Bio

*Use your own bio.* (Speaker is supplying their own — no draft needed.)

## Speaker Tagline

*Use your own, or:* Building agentic DevOps you can actually audit.

---

## Pre-submit Checklist

- [ ] Confirm track names + available formats on the live Sessionize form
- [ ] Pick Elevator Pitch: Option A (recommended) or trim Option B to fit the field
- [ ] Description is final (998 chars) — paste as-is
- [ ] Paste your own bio + headshot + tagline
- [ ] Agree to CNCF Code of Conduct
- [ ] (Recommended) Linux Foundation Inclusive Speaker Orientation
- [ ] Submit before 11:59 PM Mountain Time, May 31, 2026
