describe("Workshop launcher integration", () => {
  it("opens the dashboard automatically when ?dashboard=open is in the URL", () => {
    cy.visit("/?dashboard=open");
    cy.get("#dashboard-modal", { timeout: 5000 }).should("be.visible");
  });

  it("does NOT auto-open the dashboard for a normal visit", () => {
    cy.visit("/");
    cy.get("#dashboard-modal").should("not.be.visible");
  });

  it("closes the dashboard modal on Escape key", () => {
    cy.visit("/?dashboard=open");
    cy.get("#dashboard-modal").should("be.visible");
    cy.get("body").type("{esc}");
    cy.get("#dashboard-modal").should("not.be.visible");
  });

  it("closes the compare modal on Escape key", () => {
    cy.visit("/");
    cy.get("#compare-btn").click();
    cy.get("#compare-modal").should("be.visible");
    cy.get("body").type("{esc}");
    cy.get("#compare-modal").should("not.be.visible");
  });
});
