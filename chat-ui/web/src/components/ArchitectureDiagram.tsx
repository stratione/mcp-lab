// Inline SVG mirror of docs/architecture.excalidraw.json (the SVG has since
// diverged: registry split into two boxes, hello-app marked as artifact with
// dashed border + "build + deploy" label on the runner arrow).
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
      <text x="370" y="148" textAnchor="middle" fontFamily="Virgil, Comic Sans MS, system-ui" fontSize="18" fill="#1e1e1e" fontWeight="600">
        chat-ui
      </text>
      <text x="370" y="166" textAnchor="middle" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace" fontSize="10" fill="#1e3a8a">
        localhost:3001
      </text>

      {/* LLM */}
      <rect x="600" y="115" width="170" height="60" rx="12" fill="#fff3bf" stroke="#fbbf24" strokeWidth="2" />
      <text x="685" y="140" textAnchor="middle" fontFamily="Virgil, Comic Sans MS, system-ui" fontSize="14" fill="#1e1e1e" fontWeight="600">
        LLM
      </text>
      <text x="685" y="156" textAnchor="middle" fontFamily="Virgil, Comic Sans MS, system-ui" fontSize="10" fill="#666">
        Ollama / OpenAI / ...
      </text>
      <text x="685" y="170" textAnchor="middle" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace" fontSize="9" fill="#92400e">
        localhost:11434 · cloud APIs
      </text>

      {/* User → chat-ui */}
      <line x1="120" y1="145" x2="285" y2="145" stroke="#60a5fa" strokeWidth="2" markerEnd="url(#arrow-blue)" />

      {/* chat-ui ↔ LLM (bi-dir, orchestration loop) */}
      <line x1="450" y1="145" x2="600" y2="145" stroke="#fbbf24" strokeWidth="2" markerStart="url(#arrow-amber-start)" markerEnd="url(#arrow-amber)" />
      <text x="525" y="135" textAnchor="middle" fontFamily="Virgil, Comic Sans MS, system-ui" fontSize="11" fill="#fbbf24" fontWeight="700">
        prompt + tool defs
      </text>
      <text x="525" y="161" textAnchor="middle" fontFamily="Virgil, Comic Sans MS, system-ui" fontSize="10" fill="currentColor" opacity="0.6">
        reply or tool_call
      </text>

      {/* MCP servers (5 boxes) — port label sits below each box, inside the
          MCP zone, so attendees can map "the box on the diagram" to "the
          row in the MCP servers panel" by port number. */}
      {[
        { x: 40, label: 'mcp-user', port: '8003' },
        { x: 190, label: 'mcp-gitea', port: '8004' },
        { x: 340, label: 'mcp-registry', port: '8005' },
        { x: 490, label: 'mcp-promotion', port: '8006' },
        { x: 640, label: 'mcp-runner', port: '8007' },
      ].map((m) => (
        <g key={m.label}>
          <rect x={m.x} y="260" width="130" height="50" rx="10" fill="#d0bfff" stroke="#a78bfa" strokeWidth="2" />
          <text
            x={m.x + 65}
            y="288"
            textAnchor="middle"
            fontFamily="Virgil, Comic Sans MS, system-ui"
            fontSize={m.label === 'mcp-promotion' ? 13 : 14}
            fill="#1e1e1e"
            fontWeight="600"
          >
            {m.label}
          </text>
          <text
            x={m.x + 65}
            y="304"
            textAnchor="middle"
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            fontSize="10"
            fill="#5b21b6"
          >
            localhost:{m.port}
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
      {/* Annotation on the fan-out so people don't think the LLM talks to MCP */}
      <text x="200" y="252" textAnchor="middle" fontFamily="Virgil, Comic Sans MS, system-ui" fontSize="10" fill="#a78bfa" fontWeight="600">
        JSON-RPC tool/call
      </text>

      {/* Backing services row — port labels live just below each box,
          monospace so they read as URLs and align under their owners. */}
      {/* user-api */}
      <rect x="40" y="405" width="130" height="50" rx="10" fill="#b2f2bb" stroke="#4ade80" strokeWidth="2" />
      <text x="105" y="434" textAnchor="middle" fontFamily="Virgil, Comic Sans MS, system-ui" fontSize="14" fill="#1e1e1e" fontWeight="600">user-api</text>
      <text x="105" y="470" textAnchor="middle" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace" fontSize="10" fill="#15803d">localhost:8001</text>

      {/* gitea */}
      <rect x="190" y="405" width="130" height="50" rx="10" fill="#b2f2bb" stroke="#4ade80" strokeWidth="2" />
      <text x="255" y="434" textAnchor="middle" fontFamily="Virgil, Comic Sans MS, system-ui" fontSize="14" fill="#1e1e1e" fontWeight="600">gitea</text>
      <text x="255" y="470" textAnchor="middle" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace" fontSize="10" fill="#15803d">localhost:3000</text>

      {/* registry — TWO boxes side-by-side under mcp-registry to show it's a two-part system */}
      <rect x="340" y="405" width="62" height="50" rx="10" fill="#b2f2bb" stroke="#4ade80" strokeWidth="2" />
      <text x="371" y="430" textAnchor="middle" fontFamily="Virgil, Comic Sans MS, system-ui" fontSize="11" fill="#1e1e1e" fontWeight="600">registry</text>
      <text x="371" y="445" textAnchor="middle" fontFamily="Virgil, Comic Sans MS, system-ui" fontSize="11" fill="#1e1e1e" fontWeight="600">-dev</text>
      <text x="371" y="470" textAnchor="middle" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace" fontSize="9" fill="#15803d">:5001</text>
      <rect x="408" y="405" width="62" height="50" rx="10" fill="#b2f2bb" stroke="#4ade80" strokeWidth="2" />
      <text x="439" y="430" textAnchor="middle" fontFamily="Virgil, Comic Sans MS, system-ui" fontSize="11" fill="#1e1e1e" fontWeight="600">registry</text>
      <text x="439" y="445" textAnchor="middle" fontFamily="Virgil, Comic Sans MS, system-ui" fontSize="11" fill="#1e1e1e" fontWeight="600">-prod</text>
      <text x="439" y="470" textAnchor="middle" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace" fontSize="9" fill="#15803d">:5002</text>

      {/* promotion-service */}
      <rect x="490" y="405" width="130" height="50" rx="10" fill="#b2f2bb" stroke="#4ade80" strokeWidth="2" />
      <text x="555" y="434" textAnchor="middle" fontFamily="Virgil, Comic Sans MS, system-ui" fontSize="12" fill="#1e1e1e" fontWeight="600">promotion-service</text>
      <text x="555" y="470" textAnchor="middle" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace" fontSize="10" fill="#15803d">localhost:8002</text>

      {/* hello-app — runner's ARTIFACT (built + deployed by mcp-runner), not a peer service */}
      <rect x="640" y="405" width="130" height="50" rx="10" fill="#b2f2bb" stroke="#4ade80" strokeWidth="2" strokeDasharray="4 3" />
      <text x="705" y="430" textAnchor="middle" fontFamily="Virgil, Comic Sans MS, system-ui" fontSize="11" fill="#1e1e1e" fontWeight="600">hello world app</text>
      <text x="705" y="446" textAnchor="middle" fontFamily="Virgil, Comic Sans MS, system-ui" fontSize="9" fill="#15803d" fontStyle="italic">artifact (built + deployed)</text>
      <text x="705" y="470" textAnchor="middle" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace" fontSize="10" fill="#15803d">localhost:9080</text>

      {/* MCP → backing service arrows */}
      {/* mcp-user → user-api */}
      <line x1="105" y1="310" x2="105" y2="405" stroke="#4ade80" strokeWidth="1.5" markerEnd="url(#arrow-green)" />
      {/* mcp-gitea → gitea */}
      <line x1="255" y1="310" x2="255" y2="405" stroke="#4ade80" strokeWidth="1.5" markerEnd="url(#arrow-green)" />
      {/* mcp-registry forks to BOTH registries */}
      <line x1="405" y1="310" x2="371" y2="405" stroke="#4ade80" strokeWidth="1.5" markerEnd="url(#arrow-green)" />
      <line x1="405" y1="310" x2="439" y2="405" stroke="#4ade80" strokeWidth="1.5" markerEnd="url(#arrow-green)" />
      {/* mcp-promotion → promotion-service */}
      <line x1="555" y1="310" x2="555" y2="405" stroke="#4ade80" strokeWidth="1.5" markerEnd="url(#arrow-green)" />
      {/* mcp-runner builds + deploys hello-app — labeled to clarify the relationship */}
      <line x1="705" y1="310" x2="705" y2="405" stroke="#4ade80" strokeWidth="1.5" markerEnd="url(#arrow-green)" />
      <text x="710" y="360" fontFamily="Virgil, Comic Sans MS, system-ui" fontSize="10" fill="#15803d" fontStyle="italic">build + deploy</text>

      {/* Footer — currentColor at reduced opacity reads on both light and dark */}
      <text
        x="400"
        y="525"
        textAnchor="middle"
        fontFamily="Virgil, Comic Sans MS, system-ui"
        fontSize="13"
        fill="currentColor"
        opacity="0.7"
      >
        chat-ui is the MCP client. The LLM proposes tool calls in its reply;
      </text>
      <text
        x="400"
        y="545"
        textAnchor="middle"
        fontFamily="Virgil, Comic Sans MS, system-ui"
        fontSize="13"
        fill="currentColor"
        opacity="0.7"
      >
        chat-ui executes them, feeds results back, and loops until done.
      </text>
    </svg>
  )
}
