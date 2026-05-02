describe('workshop wizard (?workshop=1)', () => {
  beforeEach(() => {
    // Start with all MCPs offline.
    cy.intercept('GET', '/api/mcp-status', {
      statusCode: 200,
      body: {
        servers: [
          { name: 'user', status: 'offline', port: 8003, tools: [], tool_count: 0 },
          { name: 'gitea', status: 'offline', port: 8004, tools: [], tool_count: 0 },
          { name: 'registry', status: 'offline', port: 8005, tools: [], tool_count: 0 },
          { name: 'promotion', status: 'offline', port: 8006, tools: [], tool_count: 0 },
          { name: 'runner', status: 'offline', port: 8007, tools: [], tool_count: 0 },
        ],
        total_tools: 0,
        online_count: 0,
        engine: 'podman',
      },
    }).as('mcpStatus')

    cy.intercept('POST', '/api/probe', {
      statusCode: 200,
      body: { status: 200, body: [{ id: 1, username: 'alice' }] },
    })
    cy.intercept('GET', '/api/tools', { statusCode: 200, body: { tools: [] } })
    cy.intercept('GET', '/api/providers', {
      statusCode: 200,
      body: { providers: [], active: { provider: 'pretend' } },
    })
    cy.intercept('GET', '/api/hallucination-mode', {
      statusCode: 200,
      body: { enabled: false },
    })
    cy.intercept('GET', '/api/chat-history', {
      statusCode: 200,
      body: { turns: [], history: [] },
    })

    // Spy on /api/chat — the test must verify NO request was sent here even after
    // the wizard pre-fills the textarea.
    cy.intercept('POST', '/api/chat', cy.spy().as('chatPost')).as('chat')
  })

  it('hides the dock when ?workshop=1 is absent', () => {
    cy.visit('/')
    cy.get('[data-testid=workshop-dock]').should('not.exist')
  })

  it('walks intro → cold-open → mcp-user enable + verify, never auto-sends', () => {
    cy.visit('/?workshop=1')
    cy.get('[data-testid=workshop-dock]').should('be.visible')
    cy.get('[data-testid=workshop-intro]').contains('Welcome to the MCP Lab')
    cy.contains('button', 'Begin').click()

    // Cold-open hallucinate
    cy.get('[data-testid=workshop-hallucinate]').should('exist')
    cy.get('[data-testid=chat-input]').should('have.value', 'List all users in the system.')

    // Critical: the wizard pre-filled the input, but the chat send must NOT
    // have fired. Send button is enabled (input non-empty), but no /api/chat
    // request has been made.
    cy.get('[data-testid=chat-send]').should('not.be.disabled')
    cy.get('@chatPost').should('not.have.been.called')

    cy.contains('button', 'Next →').click()

    // mcp-user pre-enable hallucinate
    cy.get('[data-testid=workshop-hallucinate]').should('exist')
    cy.contains('button', 'Next →').click()

    // mcp-user enable card — engine label is podman, Next disabled
    cy.get('[data-testid=workshop-enable]').contains('podman compose up -d mcp-user')
    cy.contains('button', 'Next →').should('be.disabled')

    // Flip mcp-user online and confirm advance is now possible.
    cy.intercept('GET', '/api/mcp-status', (req) => {
      req.reply({
        statusCode: 200,
        body: {
          servers: [
            {
              name: 'user',
              status: 'online',
              port: 8003,
              tools: ['list_users'],
              tool_count: 1,
            },
            { name: 'gitea', status: 'offline', port: 8004, tools: [], tool_count: 0 },
            { name: 'registry', status: 'offline', port: 8005, tools: [], tool_count: 0 },
            { name: 'promotion', status: 'offline', port: 8006, tools: [], tool_count: 0 },
            { name: 'runner', status: 'offline', port: 8007, tools: [], tool_count: 0 },
          ],
          total_tools: 1,
          online_count: 1,
          engine: 'podman',
        },
      })
    })
    cy.get('[data-testid=workshop-enable-status]', { timeout: 6000 }).should('contain', '✓')
    cy.contains('button', 'Next →').should('not.be.disabled').click()

    // Verify card runs probe; body renders.
    cy.get('[data-testid=workshop-verify]').should('exist')
    cy.get('[data-testid=workshop-verify-body]').should('contain', 'alice')

    // Final no-auto-send check: throughout this entire walk, /api/chat must
    // never have been invoked.
    cy.get('@chatPost').should('not.have.been.called')
  })
})
