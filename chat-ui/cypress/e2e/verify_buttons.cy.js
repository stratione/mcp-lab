// Per-tool Verify buttons (M7).
//
// The audience needs a "trust but verify" link on every tool-call card so
// they can hit the source of truth directly:
//   - list_users    → fetches /users from User API and shows the JSON inline
//   - create_gitea_repo → opens http://localhost:3000/{owner}/{name} in a new tab
//   - deploy_app    → opens http://localhost:9082/ in a new tab
//   - scan_image    → no source of truth (mock), no Verify button
// Etc.
//
// These tests stub /api/chat with canned tool-call results so the assertions
// about Verify buttons are deterministic and don't need real MCP servers.

function _stubChat(toolCalls, replyText = "stub reply") {
  cy.intercept("POST", "/api/chat", {
    statusCode: 200,
    body: {
      reply: replyText,
      tool_calls: toolCalls,
      token_usage: { input_tokens: 10, output_tokens: 10, total_tokens: 20 },
      confidence: { score: 0.9, label: "Verified", source: "heuristic", details: "" },
      hallucination_mode: false,
    },
  }).as("chatStub");
}

function _sendOnce(prompt = "go") {
  cy.get("#user-input").type(prompt);
  cy.get("#send-btn").click();
  cy.wait("@chatStub");
}

describe("Per-tool Verify buttons", () => {
  beforeEach(() => {
    cy.request("POST", "/api/hallucination-mode", { enabled: false });
    cy.visit("/");
  });

  it("renders a Verify button on a list_users tool card", () => {
    _stubChat([
      {
        name: "list_users",
        arguments: {},
        result: '[{"id":1,"username":"alice"}]',
      },
    ], "users listed");
    _sendOnce("list users");
    cy.get(".tool-card").last().find(".tool-verify-btn")
      .should("be.visible")
      .and("contain", "Verify");
  });

  it("does NOT render a Verify button for scan_image (no source of truth)", () => {
    _stubChat([
      {
        name: "scan_image",
        arguments: { image_name: "sample-app", tag: "v1.0.0" },
        result: '{"status":"PASSED"}',
      },
    ], "scanned");
    _sendOnce("scan it");
    cy.get(".tool-card").last().find(".tool-verify-btn").should("not.exist");
  });

  it("inline-verifies list_users by fetching the User API via /api/probe", () => {
    _stubChat([
      {
        name: "list_users",
        arguments: {},
        result: '[{"id":1,"username":"alice"}]',
      },
    ]);
    cy.intercept("POST", "/api/probe", (req) => {
      expect(req.body.url).to.match(/localhost:8001\/users/);
      req.reply({
        statusCode: 200,
        body: {
          status: 200,
          body: [
            { id: 1, username: "alice", role: "admin" },
            { id: 2, username: "bob", role: "dev" },
          ],
        },
      });
    }).as("probeReq");

    _sendOnce("list users");
    cy.get(".tool-card").last().find(".tool-verify-btn").click();
    cy.wait("@probeReq");
    cy.get(".tool-card").last().find(".tool-verify-result")
      .should("be.visible")
      .and("contain", "alice")
      .and("contain", "bob")
      .and("contain", "200");
  });

  it("substitutes tool arguments into the verify URL (get_user_by_username)", () => {
    _stubChat([
      {
        name: "get_user_by_username",
        arguments: { username: "charlie" },
        result: '{"id":3,"username":"charlie"}',
      },
    ]);
    cy.intercept("POST", "/api/probe", (req) => {
      expect(req.body.url).to.contain("/users/by-username/charlie");
      req.reply({
        statusCode: 200,
        body: { status: 200, body: { id: 3, username: "charlie", role: "dev" } },
      });
    }).as("probeReq");

    _sendOnce();
    cy.get(".tool-card").last().find(".tool-verify-btn").click();
    cy.wait("@probeReq");
    cy.get(".tool-card").last().find(".tool-verify-result").should("contain", "charlie");
  });

  it("substitutes args for create_user verify (username from create call)", () => {
    _stubChat([
      {
        name: "create_user",
        arguments: { username: "newperson", email: "n@example.com",
                     full_name: "New Person", role: "dev" },
        result: '{"id":7,"username":"newperson"}',
      },
    ]);
    cy.intercept("POST", "/api/probe", (req) => {
      expect(req.body.url).to.contain("/users/by-username/newperson");
      req.reply({
        statusCode: 200,
        body: { status: 200, body: { id: 7, username: "newperson", role: "dev" } },
      });
    }).as("probeReq");

    _sendOnce();
    cy.get(".tool-card").last().find(".tool-verify-btn").click();
    cy.wait("@probeReq");
    cy.get(".tool-card").last().find(".tool-verify-result").should("contain", "newperson");
  });

  it("opens a new tab for create_gitea_repo (web UI verification)", () => {
    _stubChat([
      {
        name: "create_gitea_repo",
        arguments: { name: "my-service" },
        result: '{"full_name":"mcpadmin/my-service"}',
      },
    ]);
    // Stub window.open so we can assert without actually opening tabs.
    cy.window().then((win) => {
      cy.stub(win, "open").as("winOpen");
    });
    _sendOnce();
    cy.get(".tool-card").last().find(".tool-verify-btn").click();
    cy.get("@winOpen").should("be.calledWithMatch",
      Cypress.sinon.match(/localhost:3000\/mcpadmin\/my-service/), "_blank");
  });

  it("opens a new tab for deploy_app and points at the right environment port", () => {
    _stubChat([
      {
        name: "deploy_app",
        arguments: { image_name: "hello-app", tag: "latest", environment: "prod" },
        result: '{"status":"success","app_url":"http://localhost:9082"}',
      },
    ]);
    cy.window().then((win) => {
      cy.stub(win, "open").as("winOpen");
    });
    _sendOnce();
    cy.get(".tool-card").last().find(".tool-verify-btn").click();
    cy.get("@winOpen").should("be.calledWithMatch",
      Cypress.sinon.match(/localhost:9082/), "_blank");
  });

  it("inline-verifies promote_image by listing prod registry tags", () => {
    _stubChat([
      {
        name: "promote_image",
        arguments: { image_name: "sample-app", tag: "v1.1.0", promoted_by: "eve" },
        result: '{"status":"success"}',
      },
    ]);
    cy.intercept("POST", "/api/probe", (req) => {
      expect(req.body.url).to.contain("localhost:5002/v2/sample-app/tags/list");
      req.reply({
        statusCode: 200,
        body: { status: 200, body: { name: "sample-app", tags: ["v1.1.0"] } },
      });
    }).as("probeReq");
    _sendOnce();
    cy.get(".tool-card").last().find(".tool-verify-btn").click();
    cy.wait("@probeReq");
    cy.get(".tool-card").last().find(".tool-verify-result").should("contain", "v1.1.0");
  });
});
