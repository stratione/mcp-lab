# MCP DevOps Lab — Scripts

Everyone — presenter and participants — runs the same three scripts in order.

## Follow-along

    1-preflight.sh    Check Docker/Podman, RAM, Ollama. Prints install hints.
    2-setup.sh        Create .env, start services, seed data, inject Gitea token.
    3-teardown.sh     Stop everything. Removes containers, images, volumes.

After step 2, open this URL in your browser:

    http://localhost:3001

Click the **◇ Walkthrough** button in the header to start the guided tour.
(The `?workshop=1` URL flag also still works as a deep link if you want to
open the tour automatically — same effect as clicking the button.)

## Dev / optional

    restart.sh        Rebuild + restart in place. Default: refresh whatever's
                      running. --core for chat-ui/user-api/promotion only.
                      --all for everything (including stopped).
    tunnel.sh         Expose an MCP server publicly via ngrok or cloudflared.
                      See TUNNEL.md.

## _internal/ (do not run directly — invoked by compose / sourced by other scripts)

    _internal/bootstrap.sh         docker-compose entrypoint — seeds Gitea + registry.
    _internal/init-gitea.sh        Sourced by bootstrap.sh.
    _internal/seed-registry.sh     Sourced by bootstrap.sh.
    _internal/_detect-engine.sh    Sourced by every user script — picks docker vs podman.
