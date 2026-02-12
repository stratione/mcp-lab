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
      if (turn.verification) addVerificationBadge(turn.verification);
      if (turn.token_usage) addTokenBadge(turn.token_usage);
      if (turn.reply && turn.tool_calls && turn.tool_calls.length > 0) {
        addVerifyButton(turn.reply, turn.tool_calls);
      }
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
};

function updateApiKeyField() {
  const p = providerSelect.value;
  if (p === "ollama") {
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
  modelInput.value = defaultModels[p] || "";
}

providerSelect.addEventListener("change", updateApiKeyField);

applyBtn.addEventListener("click", async () => {
  const config = {
    provider: providerSelect.value,
    model: modelInput.value || defaultModels[providerSelect.value],
  };
  if (providerSelect.value !== "ollama") {
    const info = providerInfo[providerSelect.value];
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
      addMessage("assistant", `Provider set to ${config.provider} (model: ${config.model})`);
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
  } catch (e) {
    mcpStripDot.className = "status-dot inactive";
    mcpStripLabel.textContent = "MCP servers unreachable";
  }
}

function buildMcpModal() {
  const h = window.location.hostname || "localhost";
  const body = document.getElementById("mcp-modal-body");

  const online = mcpServers.filter((s) => s.status === "online");
  const offline = mcpServers.filter((s) => s.status === "offline");
  const total = mcpServers.reduce((n, s) => n + s.tool_count, 0);

  let html = `
    <button id="mcp-modal-close" class="modal-close">&times;</button>
    <h2>MCP Server Status</h2>
    <p class="mcp-summary">${online.length} of ${mcpServers.length} servers online &mdash; ${total} tools available</p>
  `;

  for (const s of mcpServers) {
    const dotClass = s.status === "online" ? "active" : "inactive";
    const statusText = s.status === "online" ? "Online" : "Offline";
    const port = s.port || "—";
    const svcName = `mcp-${s.name}`;

    let ctrlHtml = "";
    if (easyModeEnabled) {
      if (s.status === "online") {
        ctrlHtml = `<button class="mcp-ctrl-btn mcp-ctrl-stop" data-svc="${svcName}">Stop</button>`;
      } else {
        ctrlHtml = `<button class="mcp-ctrl-btn mcp-ctrl-start" data-svc="${svcName}">Start</button>`;
      }
    }

    html += `
      <div class="mcp-server-card">
        <div class="mcp-server-header">
          <span class="status-dot ${dotClass}"></span>
          <span class="mcp-server-name">${svcName}</span>
          <span class="mcp-server-status">${statusText}</span>
          <code class="mcp-server-url">http://${h}:${port}/mcp</code>
          ${ctrlHtml}
        </div>`;

    if (s.tools.length > 0) {
      html += `<div class="mcp-server-tools">${s.tools.map((t) => `<span>${t}</span>`).join("")}</div>`;
    } else {
      html += `<div class="mcp-server-tools"><span class="mcp-no-tools">no tools</span></div>`;
    }
    html += `</div>`;
  }

  if (easyModeEnabled) {
    html += `<p class="mcp-easymode-hint">🎮 Easy Mode active — type <kbd>easymode</kbd> anywhere to toggle</p>`;
  }

  // Show how to start offline servers (uses detected engine)
  if (offline.length > 0) {
    html += `<div class="mcp-hint"><strong>Start a server:</strong><pre>`;
    for (const s of offline) {
      html += `${containerEngine} compose up -d mcp-${s.name}\n`;
    }
    html += `</pre></div>`;
  }

  body.innerHTML = html;

  document.getElementById("mcp-modal-close").addEventListener("click", () => {
    document.getElementById("mcp-modal").style.display = "none";
  });

  body.querySelectorAll(".mcp-ctrl-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const svc = btn.dataset.svc;
      const action = btn.classList.contains("mcp-ctrl-start") ? "start" : "stop";
      btn.disabled = true;
      btn.textContent = action === "start" ? "Starting…" : "Stopping…";
      try {
        const resp = await fetch("/api/mcp-control", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ service: svc, action }),
        });
        if (!resp.ok) {
          const err = await resp.json();
          btn.textContent = "Error";
          btn.title = err.detail || "unknown error";
          return;
        }
        // Refresh status and rebuild the modal
        await loadTools();
        buildMcpModal();
      } catch (e) {
        btn.textContent = "Error";
        btn.title = e.message;
      }
    });
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

    // rawtools: label the header so it's obvious the mode is active
    const modeTag = rawToolsEnabled
      ? `<span class="raw-badge">RAW</span>`
      : "";
    header.innerHTML = `<span class="tool-name">${tc.name}</span>${modeTag}<span class="toggle">&#9660; details</span>`;

    const result = tc.result || "—";
    // rawtools: show full result without any truncation; normal: cap display
    const resultDisplay = rawToolsEnabled
      ? result
      : (result.length > 1200 ? result.slice(0, 1200) + "\n…(truncated — type rawtools to see full output)" : result);

    const body = document.createElement("div");
    body.className = "tool-card-body" + (rawToolsEnabled ? " open" : "");
    body.innerHTML = `
      <div class="label">Arguments</div>
      <pre>${JSON.stringify(tc.arguments, null, 2)}</pre>
      <div class="label">Result</div>
      <pre class="${rawToolsEnabled ? "raw-result" : ""}">${resultDisplay}</pre>
    `;

    if (rawToolsEnabled) {
      header.querySelector(".toggle").innerHTML = "&#9650; hide";
    }

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

function addVerificationBadge(verification) {
  if (!verification) return;
  const badge = document.createElement("div");
  badge.className = "verification-badge";

  const dot = document.createElement("span");
  dot.className = "verification-dot";

  const label = document.createElement("span");
  label.className = "verification-label";

  if (verification.status === "verified") {
    dot.classList.add("verified");
    label.textContent = "Verified";
  } else if (verification.status === "uncertain") {
    dot.classList.add("uncertain");
    label.textContent = "Uncertain";
  } else {
    dot.classList.add("unverified");
    label.textContent = "No tools used";
  }
  label.title = verification.details || "";

  badge.appendChild(dot);
  badge.appendChild(label);
  chatArea.appendChild(badge);
  chatArea.scrollTop = chatArea.scrollHeight;
}

const TOOL_VERIFY_URLS = {
  list_users:       { url: "/users",      host: "localhost:8001", label: "User API" },
  get_user:         { url: "/users",      host: "localhost:8001", label: "User API" },
  create_user:      { url: "/users",      host: "localhost:8001", label: "User API" },
  update_user:      { url: "/users",      host: "localhost:8001", label: "User API" },
  delete_user:      { url: "/users",      host: "localhost:8001", label: "User API" },
  deactivate_user:  { url: "/users",      host: "localhost:8001", label: "User API" },
  list_registry_images:    { url: "/v2/_catalog",  host: "localhost:5001", label: "Dev Registry" },
  list_image_tags:         { url: "/v2/_catalog",  host: "localhost:5001", label: "Dev Registry" },
  get_image_manifest:      { url: "/v2/_catalog",  host: "localhost:5001", label: "Dev Registry" },
  list_promotions:         { url: "/promotions",   host: "localhost:8002", label: "Promotion API" },
  promote_image:           { url: "/promotions",   host: "localhost:8002", label: "Promotion API" },
  get_promotion:           { url: "/promotions",   host: "localhost:8002", label: "Promotion API" },
  list_gitea_repos:        { url: "",              host: "localhost:3000", label: "Gitea" },
  get_gitea_repo:          { url: "",              host: "localhost:3000", label: "Gitea" },
  create_gitea_repo:       { url: "",              host: "localhost:3000", label: "Gitea" },
  list_gitea_files:        { url: "",              host: "localhost:3000", label: "Gitea" },
  get_gitea_file_content:  { url: "",              host: "localhost:3000", label: "Gitea" },
  create_gitea_file:       { url: "",              host: "localhost:3000", label: "Gitea" },
  search_gitea_repos:      { url: "",              host: "localhost:3000", label: "Gitea" },
};

function getVerifyLinks(toolCalls) {
  const seen = new Set();
  const links = [];
  for (const tc of toolCalls) {
    const info = TOOL_VERIFY_URLS[tc.name];
    if (info && !seen.has(info.host)) {
      seen.add(info.host);
      links.push({ href: `http://${info.host}${info.url}`, label: info.label });
    }
  }
  return links;
}

function addVerifyButton(reply, toolCalls) {
  if (!toolCalls || toolCalls.length === 0) return;

  const wrapper = document.createElement("div");
  wrapper.className = "verify-wrapper";

  const btn = document.createElement("button");
  btn.className = "verify-btn";
  btn.textContent = "Verify with LLM";
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    btn.textContent = "Verifying...";

    try {
      const resp = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reply: reply, tool_calls: toolCalls }),
      });

      if (!resp.ok) {
        btn.textContent = "Verification failed";
        return;
      }

      const data = await resp.json();
      wrapper.innerHTML = "";

      const result = document.createElement("div");
      result.className = "verify-result";

      const dot = document.createElement("span");
      dot.className = "verification-dot";
      if (data.status === "verified") {
        dot.classList.add("verified");
      } else if (data.status === "hallucination") {
        dot.classList.add("hallucination");
      } else {
        dot.classList.add("uncertain");
      }

      const statusLabel = document.createElement("span");
      statusLabel.className = "verify-status";
      statusLabel.textContent =
        data.status === "verified"
          ? "LLM Verified"
          : data.status === "hallucination"
          ? "Hallucination Detected"
          : "Uncertain";

      const explanation = document.createElement("div");
      explanation.className = "verify-explanation";
      explanation.textContent = data.explanation || "";

      result.appendChild(dot);
      result.appendChild(statusLabel);
      wrapper.appendChild(result);
      wrapper.appendChild(explanation);

      if (data.status !== "verified") {
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

      if (data.token_usage) {
        sessionTokens += data.token_usage.total_tokens || 0;
        document.getElementById("token-session-total").textContent =
          sessionTokens.toLocaleString() + " tokens";
      }

      chatArea.scrollTop = chatArea.scrollHeight;
    } catch (e) {
      btn.textContent = "Verification error";
    }
  });

  wrapper.appendChild(btn);
  chatArea.appendChild(wrapper);
  chatArea.scrollTop = chatArea.scrollHeight;
}

async function sendMessage() {
  const text = userInput.value.trim();
  if (!text) return;

  addMessage("user", text);
  history.push({ role: "user", content: text });
  userInput.value = "";
  sendBtn.disabled = true;
  typing.classList.add("visible");

  try {
    const resp = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, history: history.slice(0, -1) }),
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
    addVerificationBadge(data.verification);

    if (data.token_usage) {
      addTokenBadge(data.token_usage);
      sessionTokens += data.token_usage.total_tokens || 0;
      document.getElementById("token-session-total").textContent =
        sessionTokens.toLocaleString() + " tokens";
    }

    addVerifyButton(data.reply, data.tool_calls);

    // Persist turn to localStorage
    turns.push({
      user: text,
      reply: data.reply,
      tool_calls: data.tool_calls || [],
      verification: data.verification || null,
      token_usage: data.token_usage || null,
    });
    saveTurns();
  } catch (e) {
    addMessage("error", `Network error: ${e.message}`);
  } finally {
    sendBtn.disabled = false;
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

// Render a URL cell: plain <code> normally; clickable link + ▶ probe button in easymode
function _urlCell(url) {
  if (!easyModeEnabled) return `<td><code>${url}</code></td>`;
  return `<td>
    <a class="help-url-link" href="${url}" target="_blank" rel="noopener"><code>${url}</code></a>
    <button class="probe-btn" data-url="${url}" title="Probe URL">&#9654;</button>
    <span class="probe-result" data-url="${url}"></span>
  </td>`;
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

  const easyBanner = easyModeEnabled
    ? `<p class="help-easymode-banner">🎮 Easy Mode — URLs are clickable &amp; <strong>▶</strong> probes the endpoint</p>`
    : "";

  body.innerHTML = `
    <button id="help-modal-close" class="modal-close">&times;</button>
    <h2>MCP DevOps Lab &mdash; Quick Reference</h2>
    ${easyBanner}

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
      <li>Enable all at once:
        <pre>${containerEngine} compose up -d mcp-user mcp-gitea mcp-registry mcp-promotion</pre>
      </li>
      <li>Check what's running:
        <pre>${containerEngine} compose ps\ncurl http://${h}:3001/api/tools</pre>
        ${easyModeEnabled ? `<button class="probe-btn probe-btn-inline" data-url="http://${h}:3001/api/tools" title="Run curl">&#9654; run curl</button><span class="probe-result" data-url="http://${h}:3001/api/tools"></span>` : ""}
      </li>
    </ol>

    <h3>User Roles</h3>
    <p>Available roles: <code>admin</code>, <code>dev</code>, <code>viewer</code></p>

    <h3>Scripts</h3>
    <table class="help-table">
      <tr><td><code>./scripts/0-preflight.sh</code></td><td>Check system requirements</td></tr>
      <tr><td><code>./scripts/1-setup.sh</code></td><td>First-time setup</td></tr>
      <tr><td><code>./scripts/2-open-lab.sh</code></td><td>Open lab URLs in browser</td></tr>
      <tr><td><code>./scripts/3-open-api-docs.sh</code></td><td>Open API docs in browser</td></tr>
      <tr><td><code>./scripts/4-help.sh</code></td><td>Show this help</td></tr>
      <tr><td><code>./scripts/5-teardown.sh</code></td><td>Full cleanup</td></tr>
      <tr><td><code>./scripts/6-tunnel.sh [port]</code></td><td>Expose MCP server via tunnel</td></tr>
    </table>
  `;

  document.getElementById("help-modal-close").addEventListener("click", () => {
    helpModal.style.display = "none";
  });

  body.querySelectorAll(".probe-btn").forEach((btn) => {
    const url = btn.dataset.url;
    const resultEl = body.querySelector(`.probe-result[data-url="${url}"]`);
    btn.addEventListener("click", () => runProbe(url, resultEl, btn));
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
  fetch("/api/chat-history", { method: "DELETE" }).catch(() => {});
  chatArea.innerHTML =
    '<div class="message assistant">Welcome to the MCP DevOps Lab! Select your LLM provider above and start chatting. I can help you manage users, Git repos, container images, and promotions.</div>';
  document.getElementById("token-session-total").textContent = "0 tokens";
});

// ─── Easter eggs ─────────────────────────────────────────────────────────────
// Type any of these sequences anywhere on the page (not while in an input):
//   "easymode"  — toggles GUI Start/Stop buttons on the MCP modal
//   "rawtools"  — toggles auto-expanded, untruncated tool call cards
//   "schema"    — opens a tool schema browser modal
// ─────────────────────────────────────────────────────────────────────────────

let easyModeEnabled  = localStorage.getItem("easyMode")     === "true";
let rawToolsEnabled  = localStorage.getItem("rawTools")     === "true";

const _EGGS = [
  { seq: "easymode", maxLen: 8 },
  { seq: "rawtools", maxLen: 8 },
  { seq: "schema",   maxLen: 6 },
];
const _EGG_BUF_MAX = Math.max(..._EGGS.map((e) => e.seq.length));
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
  _eggBuf = (_eggBuf + e.key.toLowerCase()).slice(-_EGG_BUF_MAX);

  if (_eggBuf.endsWith("easymode")) {
    easyModeEnabled = !easyModeEnabled;
    localStorage.setItem("easyMode", easyModeEnabled);
    _showToast(easyModeEnabled
      ? "🎮 Easy Mode unlocked — GUI controls enabled"
      : "🔒 Easy Mode off — CLI mode restored");
    _eggBuf = "";
  } else if (_eggBuf.endsWith("rawtools")) {
    rawToolsEnabled = !rawToolsEnabled;
    localStorage.setItem("rawTools", rawToolsEnabled);
    _showToast(rawToolsEnabled
      ? "🔬 Raw Tools on — cards auto-expand with full output"
      : "🔬 Raw Tools off — cards collapsed");
    _eggBuf = "";
  } else if (_eggBuf.endsWith("schema")) {
    openSchemaModal();
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
    const props  = schema.properties || {};
    const req    = new Set(schema.required || []);

    let propsHtml = "";
    for (const [pName, pDef] of Object.entries(props)) {
      const required = req.has(pName) ? `<span class="schema-required">required</span>` : "";
      const type     = pDef.type || "any";
      const desc     = pDef.description || "";
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
  const body  = document.getElementById("schema-modal-body");
  body.innerHTML = `<button id="schema-modal-close" class="modal-close">&times;</button>
    <p style="color:#9ca3af;padding:20px">Loading tool schemas…</p>`;
  document.getElementById("schema-modal-close").addEventListener("click", () => {
    modal.style.display = "none";
  });
  modal.style.display = "flex";

  try {
    const resp  = await fetch("/api/tools");
    const data  = await resp.json();
    buildSchemaModal(data.tools || []);
  } catch (e) {
    body.innerHTML += `<p style="color:#ef4444">Failed to load tools: ${e.message}</p>`;
  }
}

document.getElementById("schema-modal").addEventListener("click", (e) => {
  if (e.target.id === "schema-modal") e.target.style.display = "none";
});

// ─── Init ───
loadProviders();
loadTools();
loadSavedChat();
setInterval(loadTools, 30000);
