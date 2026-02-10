# MCP DevOps Lab — Full Lab Guide

## Overview

This lab teaches how the **Model Context Protocol (MCP)** serves as a unified control plane for DevOps systems. You'll experience three phases:

1. **Phase 1** — Manual interaction with each system via curl/REST. High friction, many credentials, different API formats.
2. **Phase 2** — Introduce MCP. Enable tools incrementally. See how the protocol abstracts complexity.
3. **Phase 3** — Full intent-based interaction. Express complex multi-system intents in natural language.

## Prerequisites

- Podman Desktop installed and running
- (Optional) Ollama installed with a model pulled (`ollama pull llama3.1`)
- (Optional) API key for OpenAI, Anthropic, or Google

## Setup

```bash
git clone <this-repo>
cd mcp_lab
cp .env.example .env
podman compose up -d
```

Wait for all services to start (~60 seconds). Check bootstrap output:

```bash
podman compose logs bootstrap
```

Copy the generated `GITEA_TOKEN` from the logs into your `.env` file.

Push a sample image to the dev registry:

```bash
podman pull alpine:3.19
podman tag alpine:3.19 localhost:5001/sample-app:v1.0.0
podman push localhost:5001/sample-app:v1.0.0
```

## Phases

Follow each phase guide in order:

1. [Phase 1: Manual Operations](PHASE_1.md)
2. [Phase 2: Introducing MCP](PHASE_2.md)
3. [Phase 3: Intent-Based DevOps](PHASE_3.md)

## Cleanup

```bash
podman compose down -v
```

This removes all containers and data volumes.
