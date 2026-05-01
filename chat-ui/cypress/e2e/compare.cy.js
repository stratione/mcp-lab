describe("Side-by-side compare", () => {
  beforeEach(() => {
    cy.visit("/");
  });

  it("opens the compare modal when ⇆ button is clicked", () => {
    cy.get("#compare-btn").should("be.visible").click();
    cy.get("#compare-modal").should("be.visible");
    cy.contains("Side-by-Side Compare").should("be.visible");
  });

  it("closes the compare modal via the X button", () => {
    cy.get("#compare-btn").click();
    cy.get("#compare-modal").should("be.visible");
    cy.get("#compare-close").click();
    cy.get("#compare-modal").should("not.be.visible");
  });

  it("pre-fills the finale prompt when 'Try the Finale' is clicked", () => {
    cy.get("#compare-btn").click();
    cy.get("#compare-finale-btn").click();
    cy.get("#compare-input").should("contain.value", "Build the hello-app");
  });

  it("renders both panes after Run Both with stubbed compare API", () => {
    cy.intercept("POST", "/api/chat-compare", {
      statusCode: 200,
      body: {
        left: {
          reply: "Ollama says: I tried but the tools weren't used.",
          tool_calls: [],
          token_usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
          elapsed_ms: 12345,
          error: null,
          provider: "ollama",
          model: "llama3.1:8b",
        },
        right: {
          reply: "Sonnet says: built, scanned, promoted, deployed at localhost:9082.",
          tool_calls: [
            { name: "build_image", arguments: {}, result: '{"status":"success"}' },
            { name: "scan_image", arguments: {}, result: '{"status":"PASSED"}' },
            { name: "promote_image", arguments: {}, result: '{"status":"success"}' },
            { name: "deploy_app", arguments: {}, result: '{"status":"success"}' },
          ],
          token_usage: { input_tokens: 200, output_tokens: 400, total_tokens: 600 },
          elapsed_ms: 23456,
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

    cy.get("#compare-left-header").should("contain", "ollama");
    cy.get("#compare-left-body").should("contain", "tools weren't used");
    cy.get("#compare-left-body").should("contain", "12345 ms");

    cy.get("#compare-right-header").should("contain", "anthropic");
    cy.get("#compare-right-body").should("contain", "build_image");
    cy.get("#compare-right-body").should("contain", "deploy_app");
    cy.get("#compare-right-body").should("contain", "23456 ms");
    cy.get("#compare-right-body").should("contain", "4 tool calls");
  });
});
