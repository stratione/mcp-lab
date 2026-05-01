describe("Chat UI smoke", () => {
  it("loads the page and shows the chat input", () => {
    cy.visit("/");
    cy.get("#user-input").should("be.visible");
  });

  it("exposes /api/tools as JSON with a tools array", () => {
    cy.request("/api/tools").its("body.tools").should("be.an", "array");
  });

  it("exposes /health as 200", () => {
    cy.request("/health").its("status").should("eq", 200);
  });
});
