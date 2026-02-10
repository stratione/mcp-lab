# Phase 3: Intent-Based DevOps (Full MCP)

With all feature switches enabled, you can express complex multi-system intents in natural language. The agent orchestrates tool calls across all systems.

## Prerequisites

Make sure all switches are enabled in `.env`:
```env
GITEA_MCP_ENABLED=true
REGISTRY_MCP_ENABLED=true
PROMOTION_MCP_ENABLED=true
```

And the MCP server is restarted: `podman compose restart mcp-server`

## Exercise 1: Full Onboarding

Try this single prompt:

> "Onboard a new developer named Charlie (charlie@example.com). Create their user account as a developer, then create a Git repository called charlie-service for them."

Watch the agent:
1. Call `create_user` to make the account
2. Call `create_gitea_repo` to create the repository
3. Report back with a summary

## Exercise 2: Policy-Aware Promotion

> "Promote the sample-app:v1.0.0 image from dev to prod. Have charlie do the promotion."

Watch the agent:
1. Call `promote_image` with charlie as the promoter
2. The promotion service checks charlie's role (developer)
3. **Promotion rejected** — charlie isn't a reviewer

Now try:

> "Update charlie's role to reviewer, then promote sample-app:v1.0.0 from dev to prod with charlie as the promoter."

The agent:
1. First finds charlie's user ID
2. Updates charlie to reviewer
3. Retries the promotion
4. **Promotion succeeds**

## Exercise 3: Audit and Investigation

> "Show me all promotion records. Which ones failed and why?"

> "What images are available in prod? How did they get there?"

> "List all users and their roles. Who has permission to promote images?"

## Exercise 4: Complex Multi-System Workflow

Try this ambitious prompt:

> "I need to set up a release process: create a user named releasebot with reviewer role, create a repo called release-automation, create a feature branch called v2-prep in sample-app, and then show me the current state of both registries."

Watch the agent chain multiple tool calls across all four systems.

## Reflection

What MCP provides as a control plane:
- **Translation** — natural language to specific API calls across systems
- **Policy enforcement** — promotion rules checked automatically
- **Credential injection** — no secrets in prompts
- **Audit trail** — all actions logged and queryable
- **Composability** — multi-system workflows from single intents
- **Progressive capability** — feature switches control the blast radius

## Cleanup

```bash
podman compose down -v
```
