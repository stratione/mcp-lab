// "Anatomy of an MCP server" — drawn as an annotated code editor
// instead of layered boxes. The point is to make attendees feel like
// they could open a Python file tomorrow and write one. Numbered
// callouts on the right point at the lines that matter; everything
// else is the framework doing its job.
//
// Reference: https://modelcontextprotocol.io/quickstart/server (FastMCP)

export function McpServerDiagram() {
  // Code lines — kept tight so the whole skeleton fits in one screen.
  const code: { num: number; text: string; mark?: string }[] = [
    { num: 1,  text: 'from mcp.server.fastmcp import FastMCP', mark: 'A' },
    { num: 2,  text: 'import httpx' },
    { num: 3,  text: '' },
    { num: 4,  text: 'mcp = FastMCP("user-tools")', mark: 'B' },
    { num: 5,  text: '' },
    { num: 6,  text: '@mcp.tool()', mark: 'C' },
    { num: 7,  text: 'async def list_users() -> str:', mark: 'D' },
    { num: 8,  text: '    """List every user in the directory.', mark: 'E' },
    { num: 9,  text: '' },
    { num: 10, text: '    Returns:' },
    { num: 11, text: '        JSON array of {id, username, role}.' },
    { num: 12, text: '    """' },
    { num: 13, text: '    async with httpx.AsyncClient() as c:', mark: 'F' },
    { num: 14, text: '        r = await c.get(USER_API + "/users")' },
    { num: 15, text: '    return r.text', mark: 'G' },
    { num: 16, text: '' },
    { num: 17, text: 'if __name__ == "__main__":' },
    { num: 18, text: '    mcp.run(transport="sse")', mark: 'H' },
  ]

  const annotations: Record<string, string> = {
    A: 'The framework. Brings transport (SSE/stdio), JSON-RPC, and schema generation — you never touch any of it.',
    B: 'Server name. Shows up in the client\'s tools/list call so users know which MCP a tool came from.',
    C: 'The only way to expose a function. Add the decorator → the tool appears in tools/list.',
    D: 'Type hints become the JSON Schema the LLM sees for arguments and the return type.',
    E: 'Docstring becomes the tool description. Write it like the LLM is your reader — be specific about what it does and when to use it.',
    F: 'The body is regular Python. Call any HTTP API, query a DB, run a subprocess — the framework doesn\'t care.',
    G: 'Return any string. JSON is conventional but not required.',
    H: 'sse for HTTP clients (chat-ui, Claude.ai). Switch to "stdio" for CLI clients like Claude Desktop.',
  }

  // Layout: two columns. Code on the left, annotations on the right.
  const lineHeight = 18
  const codeStartY = 95
  const codeX = 30
  const annotationX = 470

  // Find the y-coord of each marked line so callout arrows can target it.
  const yFor = (mark: string) => {
    const i = code.findIndex((c) => c.mark === mark)
    return i >= 0 ? codeStartY + i * lineHeight : 0
  }

  return (
    <svg
      viewBox="0 0 800 480"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-auto max-h-[80vh] text-text"
      role="img"
      aria-label="A minimal FastMCP server file with annotations explaining each line you write."
    >
      <defs>
        <marker id="cb-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="#a78bfa" />
        </marker>
      </defs>

      {/* Title */}
      <text x="400" y="28" textAnchor="middle" fontFamily="Virgil, Comic Sans MS, system-ui" fontSize="20" fill="currentColor" fontWeight="600">
        Build your own MCP server
      </text>
      <text x="400" y="48" textAnchor="middle" fontFamily="Virgil, Comic Sans MS, system-ui" fontSize="12" fill="currentColor" opacity="0.6">
        the entire file, top to bottom — annotated
      </text>

      {/* Code window */}
      <rect x="15" y="65" width="430" height="395" rx="8" fill="#1e1e2e" stroke="#a78bfa" strokeWidth="1.5" />
      {/* Window chrome */}
      <circle cx="30" cy="78" r="3.5" fill="#ef4444" />
      <circle cx="42" cy="78" r="3.5" fill="#fbbf24" />
      <circle cx="54" cy="78" r="3.5" fill="#22c55e" />
      <text x="220" y="82" textAnchor="middle" fontFamily="ui-monospace, Menlo, monospace" fontSize="11" fill="#a0a0a0">
        server.py
      </text>

      {/* Code lines */}
      {code.map((line, i) => {
        const y = codeStartY + i * lineHeight
        return (
          <g key={i}>
            <text x={codeX} y={y} fontFamily="ui-monospace, Menlo, monospace" fontSize="11" fill="#666" textAnchor="end">
              {line.num}
            </text>
            <text x={codeX + 8} y={y} fontFamily="ui-monospace, Menlo, monospace" fontSize="11.5" fill={line.mark ? '#e5e5e5' : '#a0a0a0'}>
              {line.text}
            </text>
          </g>
        )
      })}

      {/* Annotation callouts — one per marked line */}
      {Object.entries(annotations).map(([mark, text], idx) => {
        const lineY = yFor(mark) - 4
        // Stack callouts vertically on the right; not all aligned to lines —
        // we draw a leader line from each callout back to its line.
        const calloutY = 95 + idx * 47
        return (
          <g key={mark}>
            {/* leader line code → callout */}
            <line
              x1={codeX + 380}
              y1={lineY}
              x2={annotationX - 6}
              y2={calloutY + 16}
              stroke="#a78bfa"
              strokeWidth="0.8"
              strokeDasharray="2 2"
              opacity="0.7"
            />
            {/* mark badge inline next to the code line */}
            <circle cx={codeX + 388} cy={lineY - 3} r="7" fill="#a78bfa" />
            <text x={codeX + 388} y={lineY} textAnchor="middle" fontFamily="ui-monospace, Menlo, monospace" fontSize="9" fill="#fff" fontWeight="700">
              {mark}
            </text>
            {/* callout box */}
            <rect x={annotationX} y={calloutY} width="310" height="40" rx="5" fill="currentColor" fillOpacity="0.05" stroke="#a78bfa" strokeWidth="0.8" />
            <circle cx={annotationX + 12} cy={calloutY + 16} r="7" fill="#a78bfa" />
            <text x={annotationX + 12} y={calloutY + 19} textAnchor="middle" fontFamily="ui-monospace, Menlo, monospace" fontSize="9" fill="#fff" fontWeight="700">
              {mark}
            </text>
            <foreignObject x={annotationX + 24} y={calloutY + 4} width="282" height="36">
              <div
                style={{
                  fontFamily: 'Virgil, Comic Sans MS, system-ui',
                  fontSize: '10.5px',
                  lineHeight: 1.25,
                  color: 'currentColor',
                  opacity: 0.85,
                }}
              >
                {text}
              </div>
            </foreignObject>
          </g>
        )
      })}

      {/* Footer takeaway */}
      <text x="400" y="475" textAnchor="middle" fontFamily="Virgil, Comic Sans MS, system-ui" fontSize="12" fill="currentColor" opacity="0.7">
        That's it. Eighteen lines, one decorator per tool. Add another <tspan fontFamily="ui-monospace, Menlo, monospace">@mcp.tool()</tspan> function = another tool.
      </text>
    </svg>
  )
}
