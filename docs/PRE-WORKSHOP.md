# Pre-Workshop Read-Ahead — Ollama + Models

Do this **before the workshop**, on your home network. The required model is ~4.9 GB and the optional bonus is ~9.6 GB — pulling them on conference wifi will not be fun.

---

## TL;DR

```bash
# 1. Install Ollama
brew install ollama          # macOS
# or: curl -fsSL https://ollama.com/install.sh | sh   (Linux)

# 2. Start the Ollama daemon (leave it running)
ollama serve &

# 3. Pull the required model (~4.9 GB)
ollama pull llama3.1:8b

# 4. (Optional) Pull Gemma 4 for the bonus model-comparison segment (~9.6 GB)
ollama pull gemma4:e4b

# 5. Verify both are listed
ollama list
```

That's it. The chat-ui auto-detects whatever you've pulled.

---

## Why pre-pull

The lab runs entirely on your laptop. The only thing it needs from the internet during the workshop is a working LLM. Ollama runs models locally — but the *first* time you ask for a model it downloads multiple gigabytes from Ollama's servers.

A 4.9 GB download on a hotel/conference wifi shared with 30 other attendees can take 30+ minutes or fail outright. Pulling at home over residential broadband takes 2–5 minutes.

---

## Step 1 — Install Ollama

### macOS

```bash
brew install ollama
```

Or download the desktop app from <https://ollama.com/download/mac>.

### Linux

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

### Windows

Download the installer from <https://ollama.com/download/windows>.

After install, confirm the binary is on your PATH:

```bash
ollama --version
```

---

## Step 2 — Start the Ollama daemon

The chat-ui talks to Ollama over HTTP at `http://localhost:11434`. The daemon must be running.

```bash
ollama serve
```

On macOS the desktop app starts the daemon automatically. On Linux you can run `ollama serve &` in the background, or set up a systemd unit. Either way, verify it's up:

```bash
curl http://localhost:11434/api/tags
# → {"models":[]}   (empty array is fine — you haven't pulled anything yet)
```

---

## Step 3 — Pull the required model

`llama3.1:8b` is the workshop's default model — every demo step assumes it's available.

```bash
ollama pull llama3.1:8b
```

Size: ~4.9 GB. Time: ~3 min on a 50 Mbps connection.

---

## Step 4 (optional) — Pull Gemma 4 for the bonus comparison

Late in the workshop we'll compare how two different open-weight models behave on the same prompts. The bonus model is **Gemma 4 (E4B)** — Google's multimodal open-weight model with native function-calling support.

```bash
ollama pull gemma4:e4b
```

Size: ~9.6 GB. Time: ~6–8 min on a 50 Mbps connection.

If you only have time / disk for one, **pull `llama3.1:8b` and skip Gemma 4** — the lab works fine without it.

### Want a different Gemma 4 size?

| Tag | Disk | RAM-ish | Notes |
|-----|------|---------|-------|
| `gemma4:e2b` | 7.2 GB | 8 GB | Smallest edge variant |
| `gemma4:e4b` | 9.6 GB | 16 GB | **Recommended** — comparable to llama3.1:8b |
| `gemma4:26b` | 18 GB  | 32 GB | Mixture-of-Experts; only if you have the RAM |
| `gemma4:31b` | 20 GB  | 32 GB | Dense; needs serious hardware |

---

## Step 5 — Verify

```bash
ollama list
```

You should see something like:

```
NAME              ID              SIZE      MODIFIED
llama3.1:8b       42182419e950    4.7 GB    2 days ago
gemma4:e4b        a1b2c3d4e5f6    9.4 GB    1 minute ago    (only if you did Step 4)
```

A quick sanity-check that inference works:

```bash
ollama run llama3.1:8b "Say hello in one sentence."
```

You should get a reply within a few seconds.

---

## Step 6 — Switching models in the chat-ui (during the workshop)

Once you've followed `scripts/1-preflight.sh` and `scripts/2-setup.sh`, opened <http://localhost:3001>, and clicked the **◇ Walkthrough** button in the header:

1. Click the **provider chip** in the top-right of the header (it shows `⬩ ollama · llama3.1 · 0 tok ▾`).
2. Pick a provider (Ollama / OpenAI / Anthropic / Google), then a model from the dropdown — `Auto (recommended)` works if you don't care.
3. Click **Apply**.

The chat-ui auto-detects what you've pulled with Ollama; for cloud providers it lists what your API key can see.

---

## (Optional) Cloud LLM API keys

The lab runs **fully on Ollama with no keys** — you can do the entire workshop without any cloud account. Add a key only if you want to demo OpenAI / Anthropic / Google Gemini alongside the local model.

### Where the keys live

`scripts/2-setup.sh` creates `.env.secrets` in the project root with empty placeholders the first time you run it. Open it in your editor:

```bash
$EDITOR .env.secrets
```

You'll see three slots, all blank by default:

```bash
# Get your key at: https://console.anthropic.com/settings/keys
ANTHROPIC_API_KEY=

# Get your key at: https://platform.openai.com/api-keys
OPENAI_API_KEY=

# Get your key at: https://aistudio.google.com/app/apikey
GOOGLE_API_KEY=
```

Paste in whichever you have — the file is gitignored and `chmod 600` so it never leaves your machine.

### Apply the change

After editing, restart the chat-ui so it re-reads the env:

```bash
./scripts/restart.sh --core
```

### Or paste live in the Chat UI

If you don't want to touch the file, you can paste the key into the provider chip's **API key** field on the fly — the chat-ui keeps it in memory for the session. Faster for trying a key without committing it to disk.

### Verifying

A quick way to confirm a key works (zero token cost — these are free listing endpoints):

```bash
# Anthropic
curl -sS -o /dev/null -w 'HTTP %{http_code}\n' \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  https://api.anthropic.com/v1/models

# OpenAI
curl -sS -o /dev/null -w 'HTTP %{http_code}\n' \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  https://api.openai.com/v1/models

# Google Gemini
curl -sS -o /dev/null -w 'HTTP %{http_code}\n' \
  "https://generativelanguage.googleapis.com/v1beta/models?key=$GOOGLE_API_KEY"
```

`HTTP 200` on all three = you're good. Any 4xx (401/403) = bad or expired key.

### Workshop hygiene

- **Never** screen-share `.env.secrets` or paste it in chat.
- The chat-ui never echoes your key back to the browser (it returns a redacted preview like `sk…XYZW`), but the file on disk is the secret — protect it.
- For a recorded demo, prefer the live-paste path so the key is in memory and dies with the session.

---

## Troubleshooting

**`ollama: command not found`** — The install didn't add it to your PATH. Restart your shell, or run `which ollama` to confirm.

**`Error: pull model manifest: no such host`** — You're offline or DNS is broken. Check `ping ollama.com`.

**`Error: max retries exceeded`** — Network flakiness. Re-run the pull; Ollama resumes from where it left off.

**`Error: model requires more system memory than is available`** — You don't have enough RAM for that size. Drop to a smaller variant.

**`curl: (7) Failed to connect to localhost port 11434`** — Ollama daemon isn't running. Start it with `ollama serve`.

**Lab UI shows `provider: ollama` but every reply errors out** — The chat-ui (running in a container) can't reach your host's Ollama daemon. On Docker Desktop / Podman Desktop the URL `http://host.containers.internal:11434` is auto-mapped; on bare Linux Docker you may need to set `OLLAMA_URL` in `.env` to your host's IP.

---

## Summary

| Step | Required? | Time | Disk |
|------|-----------|------|------|
| Install Ollama        | Yes  | 2 min | ~100 MB |
| Pull `llama3.1:8b`    | Yes  | 3 min | 4.9 GB  |
| Pull `gemma4:e4b`     | Optional bonus | 6–8 min | 9.6 GB |

**Total disk** if you do everything: ~15 GB. Make sure you have at least 25 GB free.

See you at the workshop.
