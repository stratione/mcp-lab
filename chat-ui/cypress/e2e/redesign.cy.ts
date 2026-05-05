describe('chat-ui redesign — smoke', () => {
  beforeEach(() => { cy.visit('/') })

  it('renders the header brand and corner menu trigger', () => {
    cy.contains('MCP DevOps Lab').should('be.visible')
    cy.get('[data-testid="corner-menu-trigger"]').should('be.visible')
  })

  it('opens corner menu and exposes density controls', () => {
    cy.get('[data-testid="corner-menu-trigger"]').click()
    cy.contains(/^Theme$/i).should('be.visible')
    cy.contains(/^Density$/i).should('be.visible')
    cy.contains('button', /^Large$/i).click()
    cy.get('html').should('have.attr', 'data-density', 'large')
  })

  it('shows inspector tabs (mcp servers/trace/compare)', () => {
    // The "Tools" tab was retired — its content now lives inside the MCP
    // servers tab as per-server collapsible tool lists plus an OTHER row.
    cy.get('[role="tab"]').contains(/MCP servers/i).should('be.visible')
    cy.get('[role="tab"]').contains(/^trace$/i).should('be.visible')
    cy.get('[role="tab"]').contains(/^compare$/i).should('be.visible')
  })

  it('opens command palette with ⌘K (Cmd) or Ctrl+K (others)', () => {
    cy.get('body').type('{ctrl}k')
    cy.contains(/Set theme: Light/i).should('be.visible')
  })

  it('provider chip is in the input row', () => {
    cy.get('[data-testid="provider-chip"]').should('be.visible')
  })

  it('chat input is a textarea', () => {
    cy.get('[data-testid="chat-input"]').should('exist').and('match', 'textarea')
  })
})
