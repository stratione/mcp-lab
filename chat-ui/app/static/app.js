const chatArea = document.getElementById("chat-area");
const userInput = document.getElementById("user-input");
const sendBtn = document.getElementById("send-btn");
const providerSelect = document.getElementById("provider-select");
const modelInput = document.getElementById("model-input");
const apiKeyInput = document.getElementById("api-key-input");
const apiKeyGroup = document.getElementById("api-key-group");
const applyBtn = document.getElementById("apply-btn");
const typing = document.getElementById("typing");
const mcpStatus = document.getElementById("mcp-status");
const toolCount = document.getElementById("tool-count");
const toolsBar = document.getElementById("tools-bar");

let history = [];
let providerInfo = {}; // tracks has_key per provider
let sessionTokens = 0;

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

async function loadTools() {
  try {
    const resp = await fetch("/api/tools");
    const data = await resp.json();
    const tools = data.tools || [];
    if (tools.length > 0) {
      mcpStatus.className = "status-dot active";
      toolCount.textContent = `${tools.length} tools`;
      toolsBar.innerHTML =
        "MCP Tools: " + tools.map((t) => `<span>${t.name}</span>`).join("");
    } else {
      mcpStatus.className = "status-dot inactive";
      toolCount.textContent = "No tools";
      toolsBar.innerHTML = "MCP Tools: <span>none available</span>";
    }
  } catch (e) {
    mcpStatus.className = "status-dot inactive";
    toolCount.textContent = "MCP offline";
    toolsBar.innerHTML = "MCP Tools: <span>server unreachable</span>";
  }
}

function addMessage(role, content) {
  const div = document.createElement("div");
  div.className = `message ${role}`;
  div.textContent = content;
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

    const body = document.createElement("div");
    body.className = "tool-card-body";
    body.innerHTML = `
      <div class="label">Arguments</div>
      <pre>${JSON.stringify(tc.arguments, null, 2)}</pre>
      <div class="label">Result</div>
      <pre>${tc.result || "—"}</pre>
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

function buildHelpModal() {
  const h = window.location.hostname || "localhost";
  const body = document.getElementById("help-modal-body");
  body.innerHTML = `
    <button id="help-modal-close" class="modal-close">&times;</button>
    <h2>MCP DevOps Lab &mdash; Quick Reference</h2>

    <h3>Services &amp; URLs</h3>
    <table class="help-table">
      <tr><td>Chat UI</td><td><code>http://${h}:3001</code></td></tr>
      <tr><td>Gitea (Git hosting)</td><td><code>http://${h}:3000</code></td></tr>
      <tr><td>User API health</td><td><code>http://${h}:8001/health</code></td></tr>
      <tr><td>Promotion health</td><td><code>http://${h}:8002/health</code></td></tr>
      <tr><td>Registry Dev</td><td><code>http://${h}:5001/v2/_catalog</code></td></tr>
      <tr><td>Registry Prod</td><td><code>http://${h}:5002/v2/_catalog</code></td></tr>
    </table>

    <h3>MCP Servers</h3>
    <table class="help-table">
      <tr><td>mcp-user</td><td><code>http://${h}:8003/mcp</code></td><td>6 tools</td></tr>
      <tr><td>mcp-gitea</td><td><code>http://${h}:8004/mcp</code></td><td>7 tools</td></tr>
      <tr><td>mcp-registry</td><td><code>http://${h}:8005/mcp</code></td><td>3 tools</td></tr>
      <tr><td>mcp-promotion</td><td><code>http://${h}:8006/mcp</code></td><td>3 tools</td></tr>
    </table>

    <h3>Credentials</h3>
    <p>Gitea admin: <code>mcpadmin / mcpadmin123</code></p>

    <h3>Getting Started</h3>
    <ol>
      <li>Open the Chat UI: <code>http://${h}:3001</code></li>
      <li>All MCP servers start <strong>OFF</strong> by default.</li>
      <li>Enable MCP servers one at a time:
        <pre>docker compose up -d mcp-user        # +6 user tools\ndocker compose up -d mcp-gitea       # +7 git/repo tools\ndocker compose up -d mcp-registry    # +3 registry tools\ndocker compose up -d mcp-promotion   # +3 promotion tools</pre>
        <p style="font-size:11px;color:#6b7280;margin-top:4px;">Podman users: replace <code>docker</code> with <code>podman</code></p>
      </li>
      <li>Stop an MCP server: <code>docker compose stop mcp-user</code></li>
      <li>Enable all at once:
        <pre>docker compose up -d mcp-user mcp-gitea mcp-registry mcp-promotion</pre>
      </li>
      <li>Check what's running:
        <pre>docker compose ps\ncurl http://${h}:3001/api/tools</pre>
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

// Init
loadProviders();
loadTools();
setInterval(loadTools, 30000);
