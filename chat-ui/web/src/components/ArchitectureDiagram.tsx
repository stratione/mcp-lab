// Inline SVG mirror of docs/architecture.excalidraw.json. Hand-tuned colors
// and layout match the Excalidraw source so they stay in visual sync.
//
// Theming: the wrapper sets `color: var(--text)` via the text-text class,
// and any text element that uses fill="currentColor" inherits it — so the
// title, "User", "inference", and footer adapt automatically to light/dark
// mode. The boxed labels stay dark because the box fills are light pastels
// in both themes; the zone labels use mid-bright color-* values picked to
// read on either background.

export function ArchitectureDiagram() {
  return (
    <svg
      viewBox="0 0 800 580"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-auto max-h-[75vh] text-text"
      role="img"
      aria-label="MCP DevOps Lab architecture: chat-ui talks to an LLM and to five MCP servers, each of which fronts one backing service."
    >
      <defs>
        <marker id="arrow-purple" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="#a78bfa" />
        </marker>
        <marker id="arrow-green" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="#4ade80" />
        </marker>
        <marker id="arrow-blue" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="#60a5fa" />
        </marker>
        <marker id="arrow-amber" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="#fbbf24" />
        </marker>
        <marker id="arrow-amber-start" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
          <path d="M10,0 L0,5 L10,10 z" fill="#fbbf24" />
        </marker>
      </defs>

      {/* Title */}
      <text
        x="400"
        y="35"
        textAnchor="middle"
        fontFamily="Virgil, Comic Sans MS, system-ui"
        fontSize="22"
        fill="currentColor"
        fontWeight="600"
      >
        MCP DevOps Lab — Architecture
      </text>

      {/* Zone: Frontend */}
      <rect x="15" y="60" width="770" height="130" rx="12" fill="#60a5fa" fillOpacity="0.12" stroke="#60a5fa" strokeWidth="1" />
      <text x="25" y="78" fontFamily="Virgil, Comic Sans MS, system-ui" fontSize="11" fill="#60a5fa" fontWeight="700" letterSpacing="1">
        FRONTEND
      </text>

      {/* Zone: MCP Tool Layer */}
      <rect x="15" y="220" width="770" height="120" rx="12" fill="#a78bfa" fillOpacity="0.12" stroke="#a78bfa" strokeWidth="1" />
      <text x="25" y="238" fontFamily="Virgil, Comic Sans MS, system-ui" fontSize="11" fill="#a78bfa" fontWeight="700" letterSpacing="1">
        MCP TOOL LAYER
      </text>

      {/* Zone: Backing Services */}
      <rect x="15" y="370" width="770" height="130" rx="12" fill="#4ade80" fillOpacity="0.12" stroke="#4ade80" strokeWidth="1" />
      <text x="25" y="388" fontFamily="Virgil, Comic Sans MS, system-ui" fontSize="11" fill="#4ade80" fontWeight="700" letterSpacing="1">
        BACKING SERVICES
      </text>

      {/* Top row: User → chat-ui ↔ LLM */}
      {/* User stick figure — pale blue fill works on either bg; outline brighter for dark mode */}
      <circle cx="97" cy="112" r="12" fill="#a5d8ff" stroke="#60a5fa" strokeWidth="2" />
      <rect x="83" y="128" width="28" height="32" rx="6" fill="#a5d8ff" stroke="#60a5fa" strokeWidth="2" />
      <text x="97" y="180" textAnchor="middle" fontFamily="Virgil, Comic Sans MS, system-ui" fontSize="14" fill="currentColor">
        User
      </text>

      {/* chat-ui */}
      <rect x="290" y="115" width="160" height="60" rx="12" fill="#a5d8ff" stroke="#60a5fa" strokeWidth="2" />
      <text x="370" y="152" textAnchor="middle" fontFamily="Virgil, Comic Sans MS, system-ui" fontSize="20" fill="#1e1e1e" fontWeight="600">
        chat-ui
      </text>

      {/* LLM */}
      <rect x="600" y="115" width="170" height="60" rx="12" fill="#fff3bf" stroke="#fbbf24" strokeWidth="2" />
      <text x="685" y="142" textAnchor="middle" fontFamily="Virgil, Comic Sans MS, system-ui" fontSize="14" fill="#1e1e1e" fontWeight="600">
        LLM
      </text>
      <text x="685" y="161" textAnchor="middle" fontFamily="Virgil, Comic Sans MS, system-ui" fontSize="11" fill="#666">
        Ollama / OpenAI / ...
      </text>

      {/* User → chat-ui */}
      <line x1="120" y1="145" x2="285" y2="145" stroke="#60a5fa" strokeWidth="2" markerEnd="url(#arrow-blue)" />

      {/* chat-ui ↔ LLM (bi-dir) */}
      <line x1="450" y1="145" x2="600" y2="145" stroke="#fbbf24" strokeWidth="2" markerStart="url(#arrow-amber-start)" markerEnd="url(#arrow-amber)" />
      <text x="525" y="138" textAnchor="middle" fontFamily="Virgil, Comic Sans MS, system-ui" fontSize="11" fill="#fbbf24" fontWeight="600">
        inference
      </text>

      {/* MCP servers (5 boxes) */}
      {[
        { x: 40, label: 'mcp-user' },
        { x: 190, label: 'mcp-gitea' },
        { x: 340, label: 'mcp-registry' },
        { x: 490, label: 'mcp-promotion' },
        { x: 640, label: 'mcp-runner' },
      ].map((m) => (
        <g key={m.label}>
          <rect x={m.x} y="260" width="130" height="50" rx="10" fill="#d0bfff" stroke="#a78bfa" strokeWidth="2" />
          <text
            x={m.x + 65}
            y="291"
            textAnchor="middle"
            fontFamily="Virgil, Comic Sans MS, system-ui"
            fontSize={m.label === 'mcp-promotion' ? 13 : 14}
            fill="#1e1e1e"
            fontWeight="600"
          >
            {m.label}
          </text>
        </g>
      ))}

      {/* chat-ui → 5 MCP servers (fan-out arrows) */}
      {[105, 255, 405, 555, 705].map((targetX) => (
        <line
          key={targetX}
          x1="370"
          y1="175"
          x2={targetX}
          y2="260"
          stroke="#a78bfa"
          strokeWidth="1.5"
          markerEnd="url(#arrow-purple)"
        />
      ))}

      {/* Backing services (5 boxes) */}
      {[
        { x: 40, label: 'user-api', size: 14 },
        { x: 190, label: 'gitea', size: 14 },
        { x: 340, label: 'registry dev/prod', size: 12 },
        { x: 490, label: 'promotion-service', size: 12 },
        { x: 640, label: 'hello-app', size: 14 },
      ].map((s) => (
        <g key={s.label}>
          <rect x={s.x} y="405" width="130" height="50" rx="10" fill="#b2f2bb" stroke="#4ade80" strokeWidth="2" />
          <text
            x={s.x + 65}
            y="436"
            textAnchor="middle"
            fontFamily="Virgil, Comic Sans MS, system-ui"
            fontSize={s.size}
            fill="#1e1e1e"
            fontWeight="600"
          >
            {s.label}
          </text>
        </g>
      ))}

      {/* MCP → backing service (1:1 vertical arrows) */}
      {[105, 255, 405, 555, 705].map((x) => (
        <line key={x} x1={x} y1="310" x2={x} y2="405" stroke="#4ade80" strokeWidth="1.5" markerEnd="url(#arrow-green)" />
      ))}

      {/* Footer — currentColor at reduced opacity reads on both light and dark */}
      <text
        x="400"
        y="535"
        textAnchor="middle"
        fontFamily="Virgil, Comic Sans MS, system-ui"
        fontSize="13"
        fill="currentColor"
        opacity="0.6"
      >
        Chat-UI calls MCP tools; each tool calls the underlying API.
      </text>
    </svg>
  )
}
