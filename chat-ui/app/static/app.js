const chatArea = document.getElementById("chat-area");
const userInput = document.getElementById("user-input");
const sendBtn = document.getElementById("send-btn");
const providerSelect = document.getElementById("provider-select");
const modelInput = document.getElementById("model-input");
const apiKeyInput = document.getElementById("api-key-input");
const apiKeyGroup = document.getElementById("api-key-group");
const applyBtn = document.getElementById("apply-btn");
const typing = document.getElementById("typing");
const mcpStrip = document.getElementById("mcp-strip");
const mcpStripDot = document.getElementById("mcp-strip-dot");
const mcpStripLabel = document.getElementById("mcp-strip-label");

let history = [];
let turns = []; // structured turn data for localStorage
let providerInfo = {}; // tracks has_key per provider
let sessionTokens = 0;

function saveTurns() {
  fetch("/api/chat-history", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ turns, history, sessionTokens }),
  }).catch(() => { /* silently ignore save errors */ });
}

async function loadSavedChat() {
  try {
    const resp = await fetch("/api/chat-history");
    if (!resp.ok) return;
    const saved = await resp.json();
    if (!saved.turns || saved.turns.length === 0) return;

    history = saved.history || [];
    sessionTokens = saved.sessionTokens || 0;
    turns = saved.turns;

    // Replay turns into the UI
    for (const turn of turns) {
      if (turn.user) addMessage("user", turn.user);
      if (turn.tool_calls) addToolCalls(turn.tool_calls);
      if (turn.reply) addMessage("assistant", turn.reply);
      if (turn.tool_calls && turn.tool_calls.length > 0) {
        // Handle legacy saved chats that might have old format
        let conf = turn.confidence || turn.verification;
        if (conf) {
          // Check if it's legacy verification object and convert if needed
          if (conf.status) {
            conf = {
              score: conf.status === "verified" ? 1.0 : 0.5,
              label: conf.status.charAt(0).toUpperCase() + conf.status.slice(1),
              source: "llm", // assume legacy were led by manual button
              details: conf.details
            };
          }
          addConfidenceIndicator(conf, turn.reply, turn.tool_calls);
        }
      }
      if (turn.token_usage) addTokenBadge(turn.token_usage);
    }

    document.getElementById("token-session-total").textContent =
      sessionTokens.toLocaleString() + " tokens";
  } catch (e) {
    console.error("Failed to load saved chat:", e);
  }
}

const defaultModels = {
  ollama: "llama3.1:8b",
  openai: "gpt-4o",
  anthropic: "claude-sonnet-4-5-20250929",
  google: "gemini-2.0-flash",
  pretend: "",   // no model selection for Demo LLM
};

// Providers that need neither an API key nor a model field
const _NO_KEY_NO_MODEL = new Set(["ollama", "pretend"]);

function updateApiKeyField() {
  const p = providerSelect.value;
  if (_NO_KEY_NO_MODEL.has(p)) {
    apiKeyGroup.style.display = "none";
  } else {
    apiKeyGroup.style.display = "flex";
    const info = providerInfo[p];
    if (info && info.has_key) {
      apiKeyInput.value = "";
      apiKeyInput.placeholder = "Loaded from server";
      apiKeyInput.disabled = true;
    } else {
      apiKeyInput.value = "";
      apiKeyInput.placeholder = "sk-...";
      apiKeyInput.disabled = false;
    }
  }
  // Hide model label+input for Demo LLM — it's irrelevant
  const modelGroup = document.getElementById("model-group");
  if (p === "pretend") {
    modelGroup.style.display = "none";
  } else {
    modelGroup.style.display = "contents";
    modelInput.value = defaultModels[p] || "";
  }
}

providerSelect.addEventListener("change", updateApiKeyField);

applyBtn.addEventListener("click", async () => {
  const p = providerSelect.value;
  const config = {
    provider: p,
    model: p === "pretend" ? "demo" : (modelInput.value || defaultModels[p]),
  };
  if (!_NO_KEY_NO_MODEL.has(p)) {
    const info = providerInfo[p];
    // Only send key if user typed one (not pre-loaded)
    if (!info || !info.has_key) {
      config.api_key = apiKeyInput.value;
    }
  }
  try {
    const resp = await fetch("/api/provider", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    if (resp.ok) {
      const label = p === "pretend"
        ? "Demo LLM — type **help** to see available scripted commands"
        : `Provider set to ${config.provider} (model: ${config.model})`;
      addMessage("assistant", label);
    }
  } catch (e) {
    addMessage("error", "Failed to set provider: " + e.message);
  }
});

async function loadProviders() {
  try {
    const resp = await fetch("/api/providers");
    const data = await resp.json();
    const providers = data.providers || [];
    providers.forEach((p) => {
      providerInfo[p.id] = p;
    });
    // Set active provider from server
    if (data.active) {
      providerSelect.value = data.active.provider || "ollama";
      modelInput.value = data.active.model || defaultModels[data.active.provider] || "";
    }
    updateApiKeyField();
  } catch (e) {
    console.error("Failed to load providers:", e);
  }
}

let mcpServers = []; // latest server status data
let containerEngine = "docker"; // detected from backend
let _mcpPollTimer = null;
let _mcpPrevOnlineCount = -1;

async function loadTools() {
  try {
    const resp = await fetch("/api/mcp-status");
    const data = await resp.json();
    mcpServers = data.servers || [];
    containerEngine = data.engine || "docker";
    const total = data.total_tools || 0;
    const online = data.online_count || 0;

    if (total > 0) {
      mcpStripDot.className = "status-dot active";
      mcpStripLabel.textContent = `${online} of ${mcpServers.length} MCP servers online — ${total} tools available`;
    } else {
      mcpStripDot.className = "status-dot inactive";
      mcpStripLabel.textContent = "No MCP servers online — click to see how to start them";
    }

    // If the MCP modal is open and status changed, refresh it in-place
    const mcpModal = document.getElementById("mcp-modal");
    if (mcpModal && mcpModal.style.display !== "none" && online !== _mcpPrevOnlineCount) {
      buildMcpModal();
    }
    _mcpPrevOnlineCount = online;

    // Adaptive polling: fast (3s) while any server is offline, slow (30s) when all online
    const allOnline = mcpServers.length > 0 && online === mcpServers.length;
    _scheduleMcpPoll(allOnline ? 30000 : 3000);
  } catch (e) {
    mcpStripDot.className = "status-dot inactive";
    mcpStripLabel.textContent = "MCP servers unreachable";
    _scheduleMcpPoll(5000);
  }
}

function _scheduleMcpPoll(intervalMs) {
  if (_mcpPollTimer) clearTimeout(_mcpPollTimer);
  _mcpPollTimer = setTimeout(loadTools, intervalMs);
}

function buildMcpModal() {
  const h = window.location.hostname || "localhost";
  const body = document.getElementById("mcp-modal-body");

  const online = mcpServers.filter((s) => s.status === "online");
  const offline = mcpServers.filter((s) => s.status === "offline");
  const total = mcpServers.reduce((n, s) => n + s.tool_count, 0);

  let html = `
    <div class="mcp-modal-header">
      <h2>MCP Server Status</h2>
      <div class="mcp-modal-header-actions">
        <button id="mcp-refresh-btn" class="mcp-refresh-btn" title="Refresh status"><span id="mcp-refresh-icon">&#8635;</span> Refresh</button>
        <button id="mcp-modal-close" class="modal-close">&times;</button>
      </div>
    </div>
    <p class="mcp-summary">${online.length} of ${mcpServers.length} servers online &mdash; ${total} tools available</p>
  `;

  for (const s of mcpServers) {
    const dotClass = s.status === "online" ? "active" : "inactive";
    const statusText = s.status === "online" ? "\u25B2 Online" : "\u25BC Offline";
    const port = s.port || "—";
    const svcName = `mcp-${s.name}`;

    html += `
      <div class="mcp-server-card">
        <div class="mcp-server-header">
          <span class="status-dot ${dotClass}"></span>
          <span class="mcp-server-name">${svcName}</span>
          <span class="mcp-server-status">${statusText}</span>
          <code class="mcp-server-url">http://${h}:${port}/mcp</code>
        </div>`;

    if (s.tools.length > 0) {
      html += `<div class="mcp-server-tools">${s.tools.map((t) => `<span>${t}</span>`).join("")}</div>`;
    } else {
      html += `<div class="mcp-server-tools"><span class="mcp-no-tools">no tools</span></div>`;
    }
    html += `</div>`;
  }

  // Always show start/stop reference commands
  html += `<div class="mcp-hint-grid">`;
  if (offline.length > 0) {
    html += `<div class="mcp-hint"><strong>Start a server:</strong><pre>`;
    for (const s of offline) {
      html += `${containerEngine} compose up -d mcp-${s.name}\n`;
    }
    html += `</pre></div>`;
  }
  if (online.length > 0) {
    html += `<div class="mcp-hint"><strong>Stop a server:</strong><pre>`;
    for (const s of online) {
      html += `${containerEngine} compose stop mcp-${s.name}\n`;
    }
    html += `</pre></div>`;
  }
  html += `</div>`;

  body.innerHTML = html;

  document.getElementById("mcp-modal-close").addEventListener("click", () => {
    document.getElementById("mcp-modal").style.display = "none";
  });

  document.getElementById("mcp-refresh-btn").addEventListener("click", async () => {
    const btn = document.getElementById("mcp-refresh-btn");
    const icon = document.getElementById("mcp-refresh-icon");
    btn.disabled = true;
    icon.classList.add("mcp-refresh-spinning");
    await loadTools();
    // loadTools rebuilds the modal, so btn/icon refs are stale — nothing to restore
  });

}

function openMcpModal() {
  buildMcpModal();
  document.getElementById("mcp-modal").style.display = "flex";
}

mcpStrip.addEventListener("click", openMcpModal);

document.getElementById("mcp-modal").addEventListener("click", (e) => {
  if (e.target.id === "mcp-modal") {
    e.target.style.display = "none";
  }
});

function addMessage(role, content) {
  const div = document.createElement("div");
  div.className = `message ${role}`;
  div.textContent = content;

  if (role === "assistant") {
    const copyBtn = document.createElement("button");
    copyBtn.className = "copy-btn";
    copyBtn.title = "Copy prompt + response";
    copyBtn.innerHTML = "&#128203;";
    copyBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      // Walk backwards to find the preceding user message
      let userText = "";
      let el = div.previousElementSibling;
      while (el) {
        if (el.classList.contains("message") && el.classList.contains("user")) {
          userText = el.textContent;
          break;
        }
        el = el.previousElementSibling;
      }
      const copyText = (userText ? "Prompt:\n" + userText + "\n\nResponse:\n" : "") + content;
      navigator.clipboard.writeText(copyText).then(() => {
        copyBtn.innerHTML = "&#10003;";
        copyBtn.classList.add("copied");
        setTimeout(() => { copyBtn.innerHTML = "&#128203;"; copyBtn.classList.remove("copied"); }, 1500);
      });
    });
    div.style.position = "relative";
    div.appendChild(copyBtn);
  }

  chatArea.appendChild(div);
  chatArea.scrollTop = chatArea.scrollHeight;
}

function addToolCalls(toolCalls) {
  if (!toolCalls || toolCalls.length === 0) return;
  const container = document.createElement("div");
  container.className = "tool-calls";

  toolCalls.forEach((tc) => {
    const card = document.createElement("div");
    card.className = "tool-card";

    const header = document.createElement("div");
    header.className = "tool-card-header";
    header.innerHTML = `<span class="tool-name">${tc.name}</span><span class="toggle">&#9660; details</span>`;

    const result = tc.result || "—";
    const resultDisplay = result.length > 1200 ? result.slice(0, 1200) + "\n…(truncated)" : result;

    const body = document.createElement("div");
    body.className = "tool-card-body";
    body.innerHTML = `
      <div class="label">Arguments</div>
      <pre>${JSON.stringify(tc.arguments, null, 2)}</pre>
      <div class="label">Result</div>
      <pre>${resultDisplay}</pre>
    `;

    header.addEventListener("click", () => {
      body.classList.toggle("open");
      header.querySelector(".toggle").innerHTML = body.classList.contains("open")
        ? "&#9650; hide"
        : "&#9660; details";
    });

    card.appendChild(header);
    card.appendChild(body);
    container.appendChild(card);
  });

  chatArea.appendChild(container);
  chatArea.scrollTop = chatArea.scrollHeight;
}

function addTokenBadge(usage) {
  if (!usage) return;
  const input = usage.input_tokens || 0;
  const output = usage.output_tokens || 0;
  const total = usage.total_tokens || (input + output);
  const badge = document.createElement("div");
  badge.className = "token-badge";
  badge.innerHTML =
    `<span class="token-badge-label">Tokens this turn:</span>` +
    `<span class="token-badge-detail">` +
    `<span class="token-in">${input.toLocaleString()} in</span>` +
    ` + ` +
    `<span class="token-out">${output.toLocaleString()} out</span>` +
    ` = ` +
    `<span class="token-total">${total.toLocaleString()}</span>` +
    `</span>`;
  chatArea.appendChild(badge);
  chatArea.scrollTop = chatArea.scrollHeight;
}

function addConfidenceIndicator(confidence, reply, toolCalls) {
  if (!confidence || confidence.score === 0) return;

  const wrapper = document.createElement("div");
  wrapper.className = "confidence-wrapper";

  const badge = document.createElement("button");
  badge.className = `confidence-badge ${confidence.label.split(" ")[0].toLowerCase()}`;
  badge.title = "Click to run deep verification with LLM";

  // Icon based on score/label
  let icon = "⚖️";
  if (confidence.label.includes("Verified")) icon = "✅";
  else if (confidence.label.includes("Hallucination")) icon = "🚨";
  else if (confidence.label.includes("High")) icon = "👍";
  else if (confidence.label.includes("Low")) icon = "⚠️";

  badge.innerHTML = `
    <span class="confidence-icon">${icon}</span>
    <span class="confidence-label">Confidence: ${confidence.label}</span>
    <span class="confidence-source">${confidence.source === "llm" ? "🤖 LLM" : "⚡ Heuristic"}</span>
  `;

  const details = document.createElement("div");
  details.className = "confidence-details";
  details.textContent = confidence.details;

  // If heuristic, allow clicking to upgrade to LLM verification
  if (confidence.source === "heuristic" && toolCalls && toolCalls.length > 0) {
    badge.classList.add("interactive");
    badge.addEventListener("click", async () => {
      badge.disabled = true;
      badge.classList.add("loading");
      badge.innerHTML = `<span class="confidence-icon">⏳</span> Verifying deeply...`;

      try {
        const resp = await fetch("/api/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reply: reply, tool_calls: toolCalls }),
        });

        if (resp.ok) {
          const data = await resp.json();
          // Replace this indicator with the new one
          wrapper.replaceWith(addConfidenceIndicator(data.confidence, reply, toolCalls));

          if (data.token_usage) {
            sessionTokens += data.token_usage.total_tokens || 0;
            document.getElementById("token-session-total").textContent =
              sessionTokens.toLocaleString() + " tokens";
          }
        } else {
          badge.textContent = "Verification failed";
        }
      } catch (e) {
        badge.textContent = "Error: " + e.message;
      }
    });
  }

  wrapper.appendChild(badge);
  wrapper.appendChild(details);

  // Add manual verify links if not fully verified
  if (!confidence.label.includes("Verified") && toolCalls) {
    const links = getVerifyLinks(toolCalls);
    if (links.length > 0) {
      const hint = document.createElement("div");
      hint.className = "verify-hint";
      hint.innerHTML = "Verify yourself: " + links.map(
        (l) => `<a href="${l.href}" target="_blank">${l.label}</a>`
      ).join(" | ");
      wrapper.appendChild(hint);
    }
  }

  // If called directly, return element; otherwise append to chat
  // But wait, allow this function to be used both ways
  if (document.getElementById("chat-area")) {
    document.getElementById("chat-area").appendChild(wrapper);
    document.getElementById("chat-area").scrollTop = document.getElementById("chat-area").scrollHeight;
  }
  return wrapper;
}

const TOOL_VERIFY_URLS = {
  list_users: { url: "/users", host: "localhost:8001", label: "User API" },
  get_user: { url: "/users", host: "localhost:8001", label: "User API" },
  create_user: { url: "/users", host: "localhost:8001", label: "User API" },
  update_user: { url: "/users", host: "localhost:8001", label: "User API" },
  delete_user: { url: "/users", host: "localhost:8001", label: "User API" },
  deactivate_user: { url: "/users", host: "localhost:8001", label: "User API" },
  // Registry tools - handled specially in getVerifyLinks for dynamic host
  list_registry_images: { url: "/v2/_catalog", label: "Registry" },
  list_image_tags: { url: "/v2/_catalog", label: "Registry" },
  get_image_manifest: { url: "/v2/_catalog", label: "Registry" },
  // Promotion tools
  list_promotions: { url: "/promotions", host: "localhost:8002", label: "Promotion API" },
  promote_image: { url: "/promotions", host: "localhost:8002", label: "Promotion API" },
  get_promotion: { url: "/promotions", host: "localhost:8002", label: "Promotion API" },
  // Gitea tools
  list_gitea_repos: { url: "", host: "localhost:3000", label: "Gitea" },
  get_gitea_repo: { url: "", host: "localhost:3000", label: "Gitea" },
  create_gitea_repo: { url: "", host: "localhost:3000", label: "Gitea" },
  list_gitea_files: { url: "", host: "localhost:3000", label: "Gitea" },
  get_gitea_file_content: { url: "", host: "localhost:3000", label: "Gitea" },
  create_gitea_file: { url: "", host: "localhost:3000", label: "Gitea" },
  search_gitea_repos: { url: "", host: "localhost:3000", label: "Gitea" },
};

function getVerifyLinks(toolCalls) {
  const seen = new Set();
  const links = [];

  for (const tc of toolCalls) {
    const info = TOOL_VERIFY_URLS[tc.name];
    if (!info) continue;

    let host = info.host;
    let label = info.label;

    // Dynamic host selection for registry tools
    if (tc.name.includes("registry") || tc.name.includes("image")) {
      const reg = tc.arguments && tc.arguments.registry ? tc.arguments.registry : "dev";
      if (reg === "prod") {
        host = "localhost:5002";
        label = "Prod Registry";
      } else {
        host = "localhost:5001";
        label = "Dev Registry";
      }
    }

    if (host && !seen.has(host)) {
      seen.add(host);
      links.push({ href: `http://${host}${info.url}`, label: label });
    }
  }
  return links;
}

let _chatAbort = null;

function _setChatBusy(busy) {
  if (busy) {
    sendBtn.textContent = "Stop";
    sendBtn.classList.add("stop-btn");
    sendBtn.disabled = false;
  } else {
    sendBtn.textContent = "Send";
    sendBtn.classList.remove("stop-btn");
    sendBtn.disabled = false;
  }
}

async function sendMessage() {
  // If already running, abort the in-flight request
  if (_chatAbort) {
    _chatAbort.abort();
    _chatAbort = null;
    return;
  }

  const text = userInput.value.trim();
  if (!text) return;

  addMessage("user", text);
  history.push({ role: "user", content: text });
  userInput.value = "";
  _chatAbort = new AbortController();
  _setChatBusy(true);
  typing.classList.add("visible");

  try {
    const resp = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, history: history.slice(0, -1) }),
      signal: _chatAbort.signal,
    });

    if (!resp.ok) {
      const err = await resp.json();
      addMessage("error", `Error: ${err.detail || resp.statusText}`);
      return;
    }

    const data = await resp.json();

    addToolCalls(data.tool_calls);
    addMessage("assistant", data.reply);
    history.push({ role: "assistant", content: data.reply });

    // Add confidence indicator (replaces old verification badge + button)
    addConfidenceIndicator(data.confidence, data.reply, data.tool_calls);

    if (data.token_usage) {
      addTokenBadge(data.token_usage);
      sessionTokens += data.token_usage.total_tokens || 0;
      document.getElementById("token-session-total").textContent =
        sessionTokens.toLocaleString() + " tokens";
    }

    // Persist turn to localStorage
    turns.push({
      user: text,
      reply: data.reply,
      tool_calls: data.tool_calls || [],
      confidence: data.confidence || null,
      token_usage: data.token_usage || null,
    });
    saveTurns();
  } catch (e) {
    if (e.name === "AbortError") {
      addMessage("error", "Request stopped by user.");
    } else {
      addMessage("error", `Network error: ${e.message}`);
    }
  } finally {
    _chatAbort = null;
    _setChatBusy(false);
    typing.classList.remove("visible");
  }
}

sendBtn.addEventListener("click", sendMessage);
userInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// Help modal
const helpBtn = document.getElementById("help-btn");
const helpModal = document.getElementById("help-modal");
const settingsBtn = document.getElementById("settings-btn");

settingsBtn.addEventListener("click", () => {
  document.querySelector('.config-panel').scrollIntoView({ behavior: 'smooth' });
  providerSelect.focus();
});

function _urlCell(url) {
  return `<td><code>${url}</code></td>`;
}

async function runProbe(url, resultEl, btn) {
  btn.disabled = true;
  btn.textContent = "…";
  resultEl.className = "probe-result probe-running";
  resultEl.textContent = "probing…";
  try {
    const resp = await fetch("/api/probe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const data = await resp.json();
    if (data.status === 0) {
      resultEl.className = "probe-result probe-error";
      resultEl.textContent = data.body;
    } else if (data.status >= 200 && data.status < 300) {
      resultEl.className = "probe-result probe-ok";
      const preview = typeof data.body === "object"
        ? JSON.stringify(data.body, null, 2)
        : String(data.body);
      resultEl.textContent = `${data.status} — ${preview.slice(0, 300)}`;
    } else {
      resultEl.className = "probe-result probe-error";
      resultEl.textContent = `${data.status} — ${JSON.stringify(data.body).slice(0, 200)}`;
    }
  } catch (e) {
    resultEl.className = "probe-result probe-error";
    resultEl.textContent = e.message;
  } finally {
    btn.disabled = false;
    btn.textContent = "▶";
  }
}

function buildHelpModal() {
  const h = window.location.hostname || "localhost";
  const body = document.getElementById("help-modal-body");

  body.innerHTML = `
    <button id="help-modal-close" class="modal-close">&times;</button>
    <h2>MCP DevOps Lab &mdash; Quick Reference</h2>

    <h3>Services &amp; URLs</h3>
    <table class="help-table">
      <tr><td>Chat UI</td>${_urlCell(`http://${h}:3001`)}</tr>
      <tr><td>Gitea (Git hosting)</td>${_urlCell(`http://${h}:3000`)}</tr>
      <tr><td>User API health</td>${_urlCell(`http://${h}:8001/health`)}</tr>
      <tr><td>Promotion health</td>${_urlCell(`http://${h}:8002/health`)}</tr>
      <tr><td>Registry Dev</td>${_urlCell(`http://${h}:5001/v2/_catalog`)}</tr>
      <tr><td>Registry Prod</td>${_urlCell(`http://${h}:5002/v2/_catalog`)}</tr>
    </table>

    <h3>MCP Servers</h3>
    <table class="help-table">
      <tr><td>mcp-user</td>${_urlCell(`http://${h}:8003/mcp`)}<td>6 tools</td></tr>
      <tr><td>mcp-gitea</td>${_urlCell(`http://${h}:8004/mcp`)}<td>7 tools</td></tr>
      <tr><td>mcp-registry</td>${_urlCell(`http://${h}:8005/mcp`)}<td>3 tools</td></tr>
      <tr><td>mcp-promotion</td>${_urlCell(`http://${h}:8006/mcp`)}<td>3 tools</td></tr>
    </table>

    <h3>Credentials</h3>
    <p>Gitea admin: <code>mcpadmin / mcpadmin123</code></p>

    <h3>Getting Started</h3>
    <ol>
      <li>Open the Chat UI: <code>http://${h}:3001</code></li>
      <li>All MCP servers start <strong>OFF</strong> by default.</li>
      <li>Enable MCP servers one at a time:
        <pre>${containerEngine} compose up -d mcp-user        # +6 user tools\n${containerEngine} compose up -d mcp-gitea       # +7 git/repo tools\n${containerEngine} compose up -d mcp-registry    # +3 registry tools\n${containerEngine} compose up -d mcp-promotion   # +3 promotion tools</pre>
      </li>
      <li>Stop an MCP server: <code>${containerEngine} compose stop mcp-user</code></li>
      <li>Check what's running:
        <pre>${containerEngine} compose ps\ncurl http://${h}:3001/api/tools</pre>
      </li>
    </ol>

    <h3>User Roles</h3>
    <p>Available roles: <code>admin</code>, <code>dev</code>, <code>viewer</code></p>

    <h3>Scripts</h3>
    <table class="help-table">
      <tr><td><code>./scripts/0-preflight.sh</code></td><td>Check system requirements</td></tr>
      <tr><td><code>./scripts/1-setup.sh</code></td><td>First-time setup</td></tr>
      <tr><td><code>./scripts/2-start-lab.sh</code></td><td>Restart core services</td></tr>
      <tr><td><code>./scripts/4-open-api-docs.sh</code></td><td>Open API docs in browser</td></tr>
      <tr><td><code>./scripts/5-teardown.sh</code></td><td>Full cleanup</td></tr>
      <tr><td><code>./scripts/6-tunnel.sh [port]</code></td><td>Expose MCP server via tunnel</td></tr>
    </table>
  `;

  document.getElementById("help-modal-close").addEventListener("click", () => {
    helpModal.style.display = "none";
  });
}

helpBtn.addEventListener("click", () => {
  buildHelpModal();
  helpModal.style.display = "flex";
});

helpModal.addEventListener("click", (e) => {
  if (e.target === helpModal) {
    helpModal.style.display = "none";
  }
});

// Clear chat button
document.getElementById("clear-btn").addEventListener("click", () => {
  if (!confirm("Clear chat history?")) return;
  history = [];
  turns = [];
  sessionTokens = 0;
  fetch("/api/chat-history", { method: "DELETE" }).catch(() => { });
  chatArea.innerHTML =
    '<div class="message assistant">Welcome to the MCP DevOps Lab! Select your LLM provider above and start chatting. I can help you manage users, Git repos, container images, and promotions.</div>';
  document.getElementById("token-session-total").textContent = "0 tokens";
});

// ─── Cheat sheet (unlocked by typing "thestruggleisreal") ───────────────────
// This is the only easter egg. It reveals API documentation links and
// the tool schema browser in the Lab Dashboard.
// ─────────────────────────────────────────────────────────────────────────────

let cheatSheetEnabled = localStorage.getItem("cheatSheet") === "true";
// Clean up legacy keys
localStorage.removeItem("easyMode");
localStorage.removeItem("rawTools");
localStorage.removeItem("struggleUnlocked");

let _eggBuf = "";

function _showToast(text) {
  const t = document.createElement("div");
  t.className = "easymode-toast";
  t.textContent = text;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add("visible"));
  setTimeout(() => {
    t.classList.remove("visible");
    setTimeout(() => t.remove(), 400);
  }, 2800);
}

document.addEventListener("keydown", (e) => {
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
  if (e.key.length !== 1) return;
  _eggBuf = (_eggBuf + e.key.toLowerCase()).slice(-18);

  if (_eggBuf.endsWith("thestruggleisreal")) {
    cheatSheetEnabled = !cheatSheetEnabled;
    localStorage.setItem("cheatSheet", cheatSheetEnabled);
    _showToast(cheatSheetEnabled
      ? "Cheat sheet enabled — see API documentation in the Lab Dashboard"
      : "Cheat sheet disabled");
    // If dashboard is open, rebuild it to show/hide docs section
    const dashModal = document.getElementById("dashboard-modal");
    if (dashModal.style.display !== "none" && dashModal.style.display !== "") {
      buildDashboardModal();
    }
    _eggBuf = "";
  }
});

// ─── Schema modal ─────────────────────────────────────────────────────────────

function buildSchemaModal(tools) {
  const body = document.getElementById("schema-modal-body");

  let html = `
    <button id="schema-modal-close" class="modal-close">&times;</button>
    <h2>Tool Schema Browser</h2>
    <p class="mcp-summary">${tools.length} tools loaded across all active MCP servers</p>
  `;

  for (const tool of tools) {
    const schema = tool.inputSchema || { type: "object", properties: {} };
    const props = schema.properties || {};
    const req = new Set(schema.required || []);

    let propsHtml = "";
    for (const [pName, pDef] of Object.entries(props)) {
      const required = req.has(pName) ? `<span class="schema-required">required</span>` : "";
      const type = pDef.type || "any";
      const desc = pDef.description || "";
      propsHtml += `
        <tr>
          <td class="schema-prop-name"><code>${pName}</code>${required}</td>
          <td class="schema-prop-type">${type}</td>
          <td class="schema-prop-desc">${desc}</td>
        </tr>`;
    }

    html += `
      <div class="schema-tool-card">
        <div class="schema-tool-name">${tool.name}</div>
        <div class="schema-tool-desc">${tool.description || ""}</div>
        ${propsHtml
        ? `<table class="schema-props-table"><thead>
               <tr><th>Parameter</th><th>Type</th><th>Description</th></tr>
             </thead><tbody>${propsHtml}</tbody></table>`
        : `<p class="schema-no-params">No parameters</p>`}
      </div>`;
  }

  body.innerHTML = html;
  document.getElementById("schema-modal-close").addEventListener("click", () => {
    document.getElementById("schema-modal").style.display = "none";
  });
}

async function openSchemaModal() {
  const modal = document.getElementById("schema-modal");
  const body = document.getElementById("schema-modal-body");
  body.innerHTML = `<button id="schema-modal-close" class="modal-close">&times;</button>
    <p style="color:#9ca3af;padding:20px">Loading tool schemas…</p>`;
  document.getElementById("schema-modal-close").addEventListener("click", () => {
    modal.style.display = "none";
  });
  modal.style.display = "flex";

  try {
    const resp = await fetch("/api/tools");
    const data = await resp.json();
    buildSchemaModal(data.tools || []);
  } catch (e) {
    body.innerHTML += `<p style="color:#ef4444">Failed to load tools: ${e.message}</p>`;
  }
}

document.getElementById("schema-modal").addEventListener("click", (e) => {
  if (e.target.id === "schema-modal") e.target.style.display = "none";
});

// ─── Lab Dashboard modal ──────────────────────────────────────────────────────

const _LAB_SERVICES = [
  { label: "Chat UI", url: "http://localhost:3001", note: "this page" },
  { label: "Gitea", url: "http://localhost:3000", note: "Git hosting", creds: "mcpadmin / mcpadmin123" },
  { label: "User API", url: "http://localhost:8001/users", note: "user list" },
  { label: "Promotion Service", url: "http://localhost:8002/health", note: "health check" },
  { label: "Registry (dev)", url: "http://localhost:5001/v2/_catalog", note: "image catalog" },
  { label: "Registry (prod)", url: "http://localhost:5002/v2/_catalog", note: "image catalog" },
];

// Verify cards grouped by service
const _VERIFY_SECTIONS = [
  {
    heading: "Verify User API",
    checks: [
      { label: "List users", url: "http://localhost:8001/users", note: "all users in the system" },
      { label: "List roles", url: "http://localhost:8001/users/roles", note: "available roles" },
      { label: "User API health", url: "http://localhost:8001/health", note: "service status" },
    ],
  },
  {
    heading: "Verify Registry (dev)",
    checks: [
      { label: "Image catalog", url: "http://localhost:5001/v2/_catalog", note: "all images in dev registry" },
      { label: "sample-app tags", url: "http://localhost:5001/v2/sample-app/tags/list", note: "available tags for sample-app" },
    ],
  },
  {
    heading: "Verify Registry (prod)",
    checks: [
      { label: "Image catalog", url: "http://localhost:5002/v2/_catalog", note: "all images in prod registry" },
      { label: "sample-app tags", url: "http://localhost:5002/v2/sample-app/tags/list", note: "available tags (empty until promoted)" },
    ],
  },
  {
    heading: "Verify Promotion Service",
    checks: [
      { label: "Promotion health", url: "http://localhost:8002/health", note: "service status" },
      { label: "Promotion history", url: "http://localhost:8002/promotions", note: "all promotion records" },
    ],
  },
];

const _API_DOCS = [
  { label: "User API Swagger", url: "http://localhost:8001/docs", note: "interactive API documentation" },
  { label: "Promotion API Swagger", url: "http://localhost:8002/docs", note: "interactive API documentation" },
  { label: "Gitea Swagger", url: "http://localhost:3000/api/swagger", note: "interactive API documentation" },
];


function _dashCard(s, extraClass = "") {
  const credsHtml = s.creds
    ? `<span class="dash-link-creds"><code>${s.creds}</code></span>`
    : "";
  return `
    <div class="dash-link-card-wrap">
      <a href="${s.url}" target="_blank" rel="noopener" class="dash-link-card ${extraClass}">
        <span class="dash-link-label"><span class="dash-status-dot" data-probe-url="${s.url}"></span>${s.label}</span>
        <span class="dash-link-url">${s.url}</span>
        ${credsHtml}
        <span class="dash-link-note">${s.note}</span>
      </a>
    </div>`;
}

let _dashRefreshTimer = null;

async function _probeAllServices() {
  const modal = document.getElementById("dashboard-modal");
  if (modal.style.display === "none" || modal.style.display === "") return;

  const dots = modal.querySelectorAll(".dash-status-dot[data-probe-url]");
  const promises = Array.from(dots).map(async (dot) => {
    const url = dot.dataset.probeUrl;
    try {
      const resp = await fetch("/api/probe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await resp.json();
      const ok = data.status >= 200 && data.status < 300;
      dot.className = "dash-status-dot " + (ok ? "dash-dot-ok" : "dash-dot-err");
      dot.textContent = ok ? "\u25B2 UP" : "\u25BC DOWN";
    } catch {
      dot.className = "dash-status-dot dash-dot-err";
      dot.textContent = "\u25BC DOWN";
    }
  });
  await Promise.all(promises);
}

function _startDashRefresh() {
  _stopDashRefresh();
  _probeAllServices();
  _dashRefreshTimer = setInterval(_probeAllServices, 5000);
}

function _stopDashRefresh() {
  if (_dashRefreshTimer) {
    clearInterval(_dashRefreshTimer);
    _dashRefreshTimer = null;
  }
}

function _verifyCard(v) {
  return `
    <div class="verify-card">
      <div class="verify-card-top">
        <span class="verify-label">${v.label}</span>
        <span class="verify-note">${v.note}</span>
      </div>
      <code class="verify-curl">curl ${v.url}</code>
      <button class="verify-run-btn" data-url="${v.url}">&#9654; Run</button>
      <pre class="verify-result" data-url="${v.url}" style="display:none"></pre>
    </div>`;
}

function buildDashboardModal() {
  const body = document.getElementById("dashboard-modal-body");

  const servicesHtml = _LAB_SERVICES.map((s) => _dashCard(s)).join("");

  // Build all verify sections
  let verifySectionsHtml = "";
  for (const section of _VERIFY_SECTIONS) {
    const cardsHtml = section.checks.map((v) => _verifyCard(v)).join("");
    verifySectionsHtml += `
      <h3 class="dash-section-heading">${section.heading}</h3>
      <div class="verify-grid">${cardsHtml}</div>`;
  }

  // Cheat sheet: API docs + schema browser (only when unlocked)
  let docsSection = "";
  if (cheatSheetEnabled) {
    const docsHtml = _API_DOCS.map((s) => _dashCard(s, "dash-link-card--docs")).join("");
    docsSection = `
      <div class="dash-cheatsheet-banner">Cheat sheet enabled &mdash; see API documentation to learn how to better interact with the services</div>
      <h3 class="dash-section-heading">API Documentation</h3>
      <div class="dash-link-grid">${docsHtml}</div>
      <div style="margin-top:8px">
        <button id="dash-schema-btn" class="verify-run-btn" style="width:auto;padding:6px 16px">Browse Tool Schemas</button>
      </div>`;
  }

  body.innerHTML = `
    <button id="dashboard-modal-close" class="modal-close">&times;</button>
    <h2>Lab Dashboard</h2>

    <h3 class="dash-section-heading">Lab Services</h3>
    <div class="dash-link-grid">${servicesHtml}</div>

    ${verifySectionsHtml}
    ${docsSection}
  `;

  document.getElementById("dashboard-modal-close").addEventListener("click", () => {
    _stopDashRefresh();
    document.getElementById("dashboard-modal").style.display = "none";
  });

  // Wire verify Run buttons — always active
  body.querySelectorAll(".verify-run-btn").forEach((btn) => {
    // Skip the schema browser button
    if (btn.id === "dash-schema-btn") return;
    btn.addEventListener("click", async () => {
      const url = btn.dataset.url;
      const resultEl = body.querySelector(`.verify-result[data-url="${url}"]`);
      btn.disabled = true;
      btn.textContent = "Running…";
      resultEl.style.display = "block";
      resultEl.textContent = "…";
      try {
        const resp = await fetch("/api/probe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        });
        const data = await resp.json();
        const isError = data.status === 0 || data.status >= 400;
        resultEl.className = "verify-result" + (isError ? " verify-result-err" : "");
        resultEl.textContent = data.body !== undefined
          ? JSON.stringify(data.body, null, 2)
          : `HTTP ${data.status}`;
      } catch (e) {
        resultEl.className = "verify-result verify-result-err";
        resultEl.textContent = `Error: ${e.message}`;
      } finally {
        btn.disabled = false;
        btn.innerHTML = "&#9654; Run";
      }
    });
  });

  // Wire schema browser button
  const schemaBtn = document.getElementById("dash-schema-btn");
  if (schemaBtn) {
    schemaBtn.addEventListener("click", () => {
      _stopDashRefresh();
      document.getElementById("dashboard-modal").style.display = "none";
      openSchemaModal();
    });
  }
}

document.getElementById("dashboard-btn").addEventListener("click", () => {
  buildDashboardModal();
  document.getElementById("dashboard-modal").style.display = "flex";
  _startDashRefresh();
});

document.getElementById("dashboard-modal").addEventListener("click", (e) => {
  if (e.target.id === "dashboard-modal") {
    _stopDashRefresh();
    e.target.style.display = "none";
  }
});

// ─── Init ───
loadProviders();
loadTools(); // self-rescheduling: 3s while any server offline, 30s when all online
loadSavedChat();
