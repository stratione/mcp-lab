# MCP Lab — Remote Access via Tunnel

The `OPT-tunnel.sh` script exposes a local MCP server port to the public internet using Cloudflare Tunnel or ngrok. This lets remote clients — including cloud LLMs like Claude.ai — connect to your lab without a VPN.

---

## Prerequisites

Install **one** of these:

**Cloudflare Tunnel (cloudflared)** — free, no account required for quick tunnels:

```bash
# macOS
brew install cloudflare/cloudflare/cloudflared

# Linux
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 \
  -o /usr/local/bin/cloudflared && chmod +x /usr/local/bin/cloudflared
```

**ngrok** — free tier available, account required:

```bash
# macOS
brew install ngrok

# Linux / other
# Download from https://ngrok.com/download
```

---

## Usage

```bash
# Tunnel mcp-user (port 8003) — default
./scripts/OPT-tunnel.sh

# Tunnel a specific MCP server
./scripts/OPT-tunnel.sh 8003    # mcp-user   — 6 user tools
./scripts/OPT-tunnel.sh 8004    # mcp-gitea  — 7 git tools
./scripts/OPT-tunnel.sh 8005    # mcp-registry — 3 registry tools
./scripts/OPT-tunnel.sh 8006    # mcp-promotion — 3 promotion tools
```

The script prints a public HTTPS URL like:

```
https://labeled-roland-went-gulf.trycloudflare.com
```

The tunnel stays alive as long as the terminal process is running. Press `Ctrl+C` to stop it.

---

## Connecting a Cloud LLM

### Claude.ai

1. Go to **claude.ai → Settings → Integrations**
2. Add a new MCP server with this URL:
   ```
   https://<your-tunnel-url>/mcp
   ```
3. Claude.ai will discover the available tools automatically

### Claude Code

Add to `~/.claude.json`:

```json
{
  "mcpServers": {
    "mcp-lab-remote": {
      "type": "http",
      "url": "https://<your-tunnel-url>/mcp"
    }
  }
}
```

Or add via the Claude Code CLI:

```bash
claude mcp add --transport http mcp-lab-remote https://<your-tunnel-url>/mcp
```

### Other MCP Clients

Any MCP client that supports streamable-http transport can connect using:

```
https://<your-tunnel-url>/mcp
```

---

## Tunneling Multiple Servers

Each MCP server needs its own tunnel in a separate terminal:

```bash
# Terminal 1 — user tools
./scripts/OPT-tunnel.sh 8003

# Terminal 2 — gitea tools
./scripts/OPT-tunnel.sh 8004

# Terminal 3 — registry tools
./scripts/OPT-tunnel.sh 8005
```

Add each public URL as a separate MCP server in your client.

---

## Important Notes

- **Temporary URLs** — the public URL changes every time you run the tunnel (for quick/anonymous tunnels). For a stable URL, set up a named Cloudflare tunnel with a free account.
- **No authentication** — anyone with the URL can call your MCP tools. Only run the tunnel when you need it and stop it when done.
- **The MCP server must be running** before you start the tunnel. Start it first:
  ```bash
  podman compose up -d mcp-user
  ./scripts/OPT-tunnel.sh 8003
  ```
- **Cloudflare terms** — quick tunnels are for experimentation only. See [Cloudflare ToS](https://www.cloudflare.com/website-terms/) for production use requirements.
