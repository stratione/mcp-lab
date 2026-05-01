describe("Hallucination Mode toggle", () => {
  beforeEach(() => {
    // Reset to OFF before each test (deterministic baseline)
    cy.request("POST", "/api/hallucination-mode", { enabled: false });
    cy.visit("/");
  });

  afterEach(() => {
    cy.request("POST", "/api/hallucination-mode", { enabled: false });
  });

  it("button starts at OFF", () => {
    cy.get("#hallucination-toggle")
      .should("be.visible")
      .and("contain", "Off")
      .and("not.have.class", "hallucination-on");
  });

  it("clicking toggles button text and class to ON", () => {
    cy.get("#hallucination-toggle").click();
    cy.get("#hallucination-toggle")
      .should("contain", "ON")
      .and("have.class", "hallucination-on");
  });

  it("clicking again toggles back to OFF", () => {
    cy.get("#hallucination-toggle").click();
    cy.get("#hallucination-toggle").click();
    cy.get("#hallucination-toggle")
      .should("contain", "Off")
      .and("not.have.class", "hallucination-on");
  });

  it("shows the red badge on assistant reply when ON (using stubbed chat)", () => {
    // Stub the chat endpoint so the test is deterministic and fast.
    cy.intercept("POST", "/api/chat", {
      statusCode: 200,
      body: {
        reply: "I created user John (ID 1234) successfully.",
        tool_calls: [],
        token_usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
        confidence: { score: 0, label: "Hallucination Mode", source: "hallucination", details: "" },
        hallucination_mode: true,
      },
    }).as("chatReq");

    cy.get("#hallucination-toggle").click();
    cy.get("#user-input").type("Create a user named John");
    cy.get("#send-btn").click();

    cy.wait("@chatReq");
    cy.get(".message.assistant").last().find(".hallucination-badge")
      .should("be.visible")
      .and("contain", "FLYING BLIND");
  });

  it("does NOT show the badge when OFF (regression guard)", () => {
    cy.intercept("POST", "/api/chat", {
      statusCode: 200,
      body: {
        reply: "Here are the users I found via the tool.",
        tool_calls: [],
        token_usage: { input_tokens: 10, output_tokens: 10, total_tokens: 20 },
        confidence: { score: 0.9, label: "Verified", source: "heuristic", details: "" },
        hallucination_mode: false,
      },
    }).as("chatReq");

    cy.get("#user-input").type("List all users");
    cy.get("#send-btn").click();
    cy.wait("@chatReq");
    cy.get(".message.assistant").last().find(".hallucination-badge").should("not.exist");
  });
});
