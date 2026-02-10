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

// Init
loadProviders();
loadTools();
setInterval(loadTools, 30000);
