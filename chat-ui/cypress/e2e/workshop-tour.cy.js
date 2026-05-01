// Workshop tour — walks through every visual moment of the talk and
// screenshots each step. Run headed to watch the browser drive itself.
//
//   cd chat-ui
//   ./node_modules/.bin/cypress run --headed --spec cypress/e2e/workshop-tour.cy.js
//
// Screenshots land in chat-ui/cypress/screenshots/workshop-tour.cy.js/
// Video lands in chat-ui/cypress/videos/workshop-tour.cy.js.mp4

describe("Workshop tour — every visual moment", () => {
  before(() => {
    cy.request("POST", "/api/hallucination-mode", { enabled: false });
  });

  after(() => {
    cy.request("POST", "/api/hallucination-mode", { enabled: false });
  });

  it("01 — landing page (Chat UI loads)", () => {
    cy.visit("/");
    cy.get("#user-input").should("be.visible");
    cy.contains("MCP DevOps Lab").should("be.visible");
    cy.wait(800);
    cy.screenshot("01-landing", { capture: "viewport" });
  });

  it("02 — header controls (Hallucination, Compare, Dashboard, Help)", () => {
    cy.visit("/");
    cy.get("#hallucination-toggle").should("be.visible");
    cy.get("#compare-btn").should("be.visible");
    cy.get("#dashboard-btn").should("be.visible");
    cy.get("#help-btn").should("be.visible");
    cy.wait(400);
    cy.screenshot("02-header-controls");
  });

  it("03 — Hallucination Mode OFF (default)", () => {
    cy.visit("/");
    cy.get("#hallucination-toggle")
      .should("contain", "Off")
      .and("not.have.class", "hallucination-on");
    cy.screenshot("03-hallucination-off");
  });

  it("04 — Hallucination Mode toggled ON", () => {
    cy.visit("/");
    cy.get("#hallucination-toggle").click();
    cy.get("#hallucination-toggle")
      .should("contain", "ON")
      .and("have.class", "hallucination-on");
    cy.wait(400);
    cy.screenshot("04-hallucination-on");
  });

  it("05 — Hallucination Mode produces fabricated reply (stubbed)", () => {
    cy.visit("/");
    cy.intercept("POST", "/api/chat", {
      statusCode: 200,
      body: {
        reply:
          "Here are the current users:\n\n1. AdminUser (admin)\n2. JohnDoe (dev)\n3. JaneSmith (reviewer)\n4. SarahJohnson (Sales Representative)\n5. EmilyChen (admin)",
        tool_calls: [],
        token_usage: { input_tokens: 24, output_tokens: 110, total_tokens: 134 },
        confidence: { score: 0, label: "Hallucination Mode", source: "hallucination", details: "" },
        hallucination_mode: true,
      },
    }).as("chatHallu");

    cy.get("#hallucination-toggle").click();
    cy.get("#user-input").type("List all users in the system");
    cy.get("#send-btn").click();
    cy.wait("@chatHallu");
    cy.get(".message.assistant").last().find(".hallucination-badge").should("be.visible");
    cy.wait(600);
    cy.screenshot("05-hallucination-fabricated-reply");
  });

  it("06 — Hallucination toggled back OFF", () => {
    cy.visit("/");
    cy.window().then(() => cy.request("POST", "/api/hallucination-mode", { enabled: false }));
    cy.reload();
    cy.get("#hallucination-toggle").should("contain", "Off").and("not.have.class", "hallucination-on");
    cy.screenshot("06-hallucination-off-again");
  });

  it("07 — Grounded reply with tool call (stubbed list_users)", () => {
    cy.visit("/");
    cy.intercept("POST", "/api/chat", {
      statusCode: 200,
      body: {
        reply:
          "Here are the seeded users:\n\n1. alice (admin)\n2. bob (dev)\n3. charlie (dev)\n4. diana (viewer)\n5. eve (admin)\n6. system (admin)",
        tool_calls: [
          {
            name: "list_users",
            arguments: {},
            result:
              '[{"id":1,"username":"alice","role":"admin"},{"id":2,"username":"bob","role":"dev"}]',
          },
        ],
        token_usage: { input_tokens: 30, output_tokens: 90, total_tokens: 120 },
        confidence: { score: 0.95, label: "Verified", source: "heuristic", details: "" },
        hallucination_mode: false,
      },
    }).as("chatGrounded");

    cy.get("#user-input").type("List all users in the system");
    cy.get("#send-btn").click();
    cy.wait("@chatGrounded");
    cy.get(".tool-card").should("be.visible");
    cy.wait(600);
    cy.screenshot("07-grounded-reply-with-tool-call");
  });

  it("08 — Verify button visible on tool card (M7)", () => {
    cy.visit("/");
    cy.intercept("POST", "/api/chat", {
      statusCode: 200,
      body: {
        reply: "I listed the users.",
        tool_calls: [
          { name: "list_users", arguments: {}, result: '[{"id":1,"username":"alice"}]' },
        ],
        token_usage: { input_tokens: 10, output_tokens: 10, total_tokens: 20 },
        confidence: { score: 0.9, label: "Verified", source: "heuristic", details: "" },
        hallucination_mode: false,
      },
    }).as("chat");
    cy.get("#user-input").type("list users");
    cy.get("#send-btn").click();
    cy.wait("@chat");
    cy.get(".tool-verify-btn").should("be.visible").and("contain", "Verify");
    cy.wait(400);
    cy.screenshot("08-verify-button-visible");
  });

  it("09 — Verify button INLINE: clicking fetches User API and shows JSON", () => {
    cy.visit("/");
    cy.intercept("POST", "/api/chat", {
      statusCode: 200,
      body: {
        reply: "I listed the users.",
        tool_calls: [
          { name: "list_users", arguments: {}, result: '[{"id":1,"username":"alice"}]' },
        ],
        token_usage: { input_tokens: 10, output_tokens: 10, total_tokens: 20 },
        confidence: { score: 0.9, label: "Verified", source: "heuristic", details: "" },
        hallucination_mode: false,
      },
    }).as("chat");
    cy.intercept("POST", "/api/probe", {
      statusCode: 200,
      body: {
        status: 200,
        body: [
          { id: 1, username: "alice", email: "alice@example.com", full_name: "Alice Johnson", role: "admin", is_active: true },
          { id: 2, username: "bob", email: "bob@example.com", full_name: "Bob Smith", role: "dev", is_active: true },
          { id: 3, username: "charlie", email: "charlie@example.com", full_name: "Charlie Davis", role: "dev", is_active: true },
        ],
      },
    }).as("probe");

    cy.get("#user-input").type("list users");
    cy.get("#send-btn").click();
    cy.wait("@chat");
    cy.get(".tool-card").last().find(".tool-verify-btn").click();
    cy.wait("@probe");
    cy.get(".tool-card").last().find(".tool-verify-result").should("be.visible");
    cy.get(".tool-card").last().find(".verify-status-ok").should("contain", "200");
    cy.get(".tool-card").last().find(".verify-body")
      .should("contain", "alice").and("contain", "bob").and("contain", "charlie");
    cy.wait(600);
    cy.screenshot("09-verify-inline-shows-real-data");
  });

  it("10 — Verify on create_user proves the user really exists (stubbed)", () => {
    cy.visit("/");
    cy.intercept("POST", "/api/chat", {
      statusCode: 200,
      body: {
        reply: "Created user newperson successfully.",
        tool_calls: [
          {
            name: "create_user",
            arguments: { username: "newperson", email: "n@example.com",
                         full_name: "New Person", role: "dev" },
            result: '{"id":7,"username":"newperson"}',
          },
        ],
        token_usage: { input_tokens: 50, output_tokens: 30, total_tokens: 80 },
        confidence: { score: 0.95, label: "Verified", source: "heuristic", details: "" },
        hallucination_mode: false,
      },
    }).as("chat");
    cy.intercept("POST", "/api/probe", (req) => {
      expect(req.body.url).to.contain("/users/by-username/newperson");
      req.reply({
        statusCode: 200,
        body: {
          status: 200,
          body: { id: 7, username: "newperson", email: "n@example.com",
                  full_name: "New Person", role: "dev", is_active: true },
        },
      });
    }).as("probe");

    cy.get("#user-input").type("create user newperson");
    cy.get("#send-btn").click();
    cy.wait("@chat");
    cy.get(".tool-card").last().find(".tool-verify-btn").click();
    cy.wait("@probe");
    cy.get(".tool-card").last().find(".verify-status-ok").should("contain", "200");
    cy.get(".tool-card").last().find(".verify-body").should("contain", "newperson");
    cy.wait(600);
    cy.screenshot("10-verify-create-user-proves-existence");
  });

  it("11 — Compare panel opens (empty state)", () => {
    cy.visit("/");
    cy.get("#compare-btn").click();
    cy.get("#compare-modal").should("be.visible");
    cy.contains("Side-by-Side Compare").should("be.visible");
    cy.wait(400);
    cy.screenshot("11-compare-panel-empty");
  });

  it("12 — Compare panel with 'Try the Finale' prefilled", () => {
    cy.visit("/");
    cy.get("#compare-btn").click();
    cy.get("#compare-finale-btn").click();
    cy.get("#compare-input").should("contain.value", "Build the hello-app");
    cy.wait(400);
    cy.screenshot("12-compare-finale-prefilled");
  });

  it("13 — Compare results: Ollama fumble vs Anthropic success", () => {
    cy.visit("/");
    cy.intercept("POST", "/api/chat-compare", {
      statusCode: 200,
      body: {
        left: {
          reply:
            "I'll need to call several functions in sequence. Here's what I would do:\n\n1. Build the image\n2. Scan for vulnerabilities\n3. Promote to prod\n4. Deploy",
          tool_calls: [],
          token_usage: { input_tokens: 250, output_tokens: 380, total_tokens: 630 },
          elapsed_ms: 43957,
          error: null,
          provider: "ollama",
          model: "llama3.1:8b",
        },
        right: {
          reply:
            "## ✅ All tasks completed!\n\n1. Built hello-app from sample-app\n2. Scanned (1 LOW vuln)\n3. Promoted to prod by eve\n4. Deployed at http://localhost:9082",
          tool_calls: [
            { name: "build_image", arguments: { image_name: "hello-app", tag: "latest" }, result: '{"status":"success"}' },
            { name: "scan_image", arguments: { image_name: "hello-app", tag: "latest" }, result: '{"status":"PASSED"}' },
            { name: "promote_image", arguments: { image_name: "hello-app", tag: "latest", promoted_by: "eve" }, result: '{"status":"success"}' },
            { name: "deploy_app", arguments: { image_name: "hello-app", tag: "latest", environment: "prod" }, result: '{"status":"success"}' },
          ],
          token_usage: { input_tokens: 800, output_tokens: 1100, total_tokens: 1900 },
          elapsed_ms: 28901,
          error: null,
          provider: "anthropic",
          model: "claude-sonnet-4-5-20250929",
        },
      },
    }).as("compareReq");

    cy.get("#compare-btn").click();
    cy.get("#compare-finale-btn").click();
    cy.get("#compare-run-btn").click();
    cy.wait("@compareReq");
    cy.get("#compare-right-body").should("contain", "build_image");
    cy.get("#compare-right-body").should("contain", "deploy_app");
    cy.wait(800);
    cy.screenshot("13-compare-results-side-by-side");
  });

  it("14 — Dashboard via ?dashboard=open URL param", () => {
    cy.visit("/?dashboard=open");
    cy.get("#dashboard-modal", { timeout: 5000 }).should("be.visible");
    cy.wait(800);
    cy.screenshot("14-dashboard-via-url-param");
  });

  it("15 — Provider selector + provider details", () => {
    cy.visit("/");
    cy.get("#provider-select").should("be.visible");
    cy.get("#model-input").should("be.visible");
    cy.screenshot("15-provider-selector");
  });
});
