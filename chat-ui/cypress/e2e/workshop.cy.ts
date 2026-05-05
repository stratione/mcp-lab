describe('workshop walkthrough (header button → inspector tab)', () => {
  beforeEach(() => {
    // Pre-mark the first-run welcome modal as seen so it doesn't intercept
    // clicks on the header walkthrough button. Same key the Walkthrough
    // component sets after the user closes it once.
    cy.window().then((win) => {
      win.localStorage.setItem('mcp-lab.walkthrough.seen.v1', '1')
    })

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
      body: { providers: [], active: { provider: 'ollama' } },
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

  it('does not render the walkthrough body until the button is clicked', () => {
    cy.visit('/')
    cy.get('[data-testid=workshop-dock]').should('not.exist')
  })

  it('walks intro → cold-open → mcp-user enable + verify, never auto-sends', () => {
    cy.visit('/')

    // Open the walkthrough via the header button. This flips workshopMode
    // and switches the inspector to the Walkthrough tab in one step.
    cy.get('[data-testid=walkthrough-button]').click()
    cy.get('[data-testid=workshop-dock]').should('be.visible')
    cy.get('[data-testid=workshop-intro]').contains('Welcome to the MCP Lab')
    cy.get('[data-testid=workshop-forward]').click()

    // Cold-open hallucinate
    cy.get('[data-testid=workshop-hallucinate]').should('exist')
    cy.get('[data-testid=chat-input]').should('have.value', 'List all users in the system.')

    // Critical: the wizard pre-filled the input, but the chat send must NOT
    // have fired. Send button is enabled (input non-empty), but no /api/chat
    // request has been made.
    cy.get('[data-testid=chat-send]').should('not.be.disabled')
    cy.get('@chatPost').should('not.have.been.called')

    cy.get('[data-testid=workshop-forward]').click()

    // Phase 1 (Identity & access) opens with the mcp-user enable card —
    // the "list_roles before list_users" exercise sequence requires it on.
    cy.get('[data-testid=workshop-enable]').contains('podman compose up -d mcp-user')

    // Flip mcp-user online and confirm the status flips to ✓.
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
    cy.get('[data-testid=workshop-forward]').click()

    // First exercise card after enable is list_roles.
    cy.get('[data-testid=workshop-hallucinate]').should('exist')
    cy.get('[data-testid=chat-input]').should('have.value',
      'What roles can a user have in this system?')
    cy.get('[data-testid=workshop-forward]').click()

    // Verify card runs probe; body renders.
    cy.get('[data-testid=workshop-verify]').should('exist')
    cy.get('[data-testid=workshop-verify-body]').should('contain', 'alice')

    // Final no-auto-send check: throughout this entire walk, /api/chat must
    // never have been invoked.
    cy.get('@chatPost').should('not.have.been.called')
  })
})
