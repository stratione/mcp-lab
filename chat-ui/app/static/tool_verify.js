// Per-tool verify map (M7).
//
// Each entry maps an MCP tool name to a "source of truth" the audience can
// hit directly to verify what the AI just claimed. The chat-ui's tool-call
// card uses this to render a Verify button.
//
//   open_in: "inline"  →  fetch via /api/probe, render JSON below the card
//   open_in: "tab"     →  window.open in a new tab (web UIs, deployed apps)
//
// `url` is a template; `{argname}` placeholders are filled from the tool's
// arguments at click time. If a placeholder cannot be filled, the entry is
// skipped (no Verify button shown).
//
// Tools with no source-of-truth entry get NO Verify button (e.g. scan_image
// is a mock — there's nothing to verify).

window.TOOL_VERIFY_MAP = {
  // ─── User Management ───
  list_users: {
    label: "Hit /users on the User API",
    url: "http://localhost:8001/users",
    open_in: "inline",
    hint: "Should match the list the AI just reported.",
  },
  list_roles: {
    label: "Hit /users/roles",
    url: "http://localhost:8001/users/roles",
    open_in: "inline",
  },
  get_user: {
    label: "Hit /users/{user_id}",
    url: "http://localhost:8001/users/{user_id}",
    open_in: "inline",
  },
  get_user_by_username: {
    label: "Hit /users/by-username/{username}",
    url: "http://localhost:8001/users/by-username/{username}",
    open_in: "inline",
  },
  create_user: {
    label: "Verify user really exists in the User API",
    url: "http://localhost:8001/users/by-username/{username}",
    open_in: "inline",
    hint: "GETs the user by name. 200 means it's really there; 404 means the AI lied.",
  },
  update_user: {
    label: "Re-fetch /users/{user_id}",
    url: "http://localhost:8001/users/{user_id}",
    open_in: "inline",
  },
  deactivate_user: {
    label: "Re-fetch /users/{user_id} — should show is_active=false",
    url: "http://localhost:8001/users/{user_id}",
    open_in: "inline",
  },
  delete_user: {
    label: "Re-fetch /users/{user_id} — should be 404",
    url: "http://localhost:8001/users/{user_id}",
    open_in: "inline",
    hint: "After delete the GET should return 404. If you see the user, the AI lied.",
  },

  // ─── Gitea ───
  list_gitea_repos: {
    label: "Browse Gitea (web UI)",
    url: "http://localhost:3000/explore/repos",
    open_in: "tab",
  },
  get_gitea_repo: {
    label: "Open the repo in Gitea",
    url: "http://localhost:3000/{owner}/{name}",
    open_in: "tab",
  },
  create_gitea_repo: {
    label: "Open the new repo in Gitea (proves it exists)",
    url: "http://localhost:3000/mcpadmin/{name}",
    open_in: "tab",
    hint: "If Gitea 404s, the repo wasn't really created.",
  },
  list_gitea_branches: {
    label: "Open the branches page",
    url: "http://localhost:3000/{owner}/{name}/branches",
    open_in: "tab",
  },
  create_gitea_branch: {
    label: "Open the new branch in Gitea",
    url: "http://localhost:3000/{owner}/{name}/src/branch/{branch_name}",
    open_in: "tab",
  },
  get_gitea_file: {
    label: "View the raw file in Gitea",
    url: "http://localhost:3000/{owner}/{name}/raw/branch/main/{path}",
    open_in: "tab",
  },
  create_gitea_file: {
    label: "View the file in Gitea",
    url: "http://localhost:3000/{owner}/{name}/src/branch/main/{path}",
    open_in: "tab",
  },

  // ─── Container Registries ───
  list_registries: {
    label: "Hit /v2/_catalog on dev registry",
    url: "http://localhost:5001/v2/_catalog",
    open_in: "inline",
  },
  list_registry_images: {
    label: "Hit /v2/_catalog directly",
    // {registry} is "dev" or "prod" → port 5001 / 5002
    url: "__registry_catalog__",
    open_in: "inline",
  },
  list_image_tags: {
    label: "Hit /v2/{image_name}/tags/list",
    url: "__registry_tags__",
    open_in: "inline",
  },
  get_image_manifest: {
    label: "Hit /v2/{image_name}/manifests/{tag}",
    url: "__registry_manifest__",
    open_in: "inline",
  },
  tag_image: {
    label: "List tags after tag operation",
    url: "__registry_tags__",
    open_in: "inline",
  },

  // ─── Promotion ───
  promote_image: {
    label: "Confirm the image landed in PROD registry",
    url: "http://localhost:5002/v2/{image_name}/tags/list",
    open_in: "inline",
    hint: "If the tag isn't in this list, the promotion failed despite the AI saying success.",
  },
  list_promotions: {
    label: "Hit the promotion service audit log",
    url: "http://localhost:8002/promotions",
    open_in: "inline",
  },
  get_promotion_status: {
    label: "Open the promotion audit log",
    url: "http://localhost:8002/promotions",
    open_in: "inline",
  },

  // ─── Runner (build/scan/deploy) ───
  build_image: {
    label: "Confirm the image landed in DEV registry",
    url: "http://localhost:5001/v2/{image_name}/tags/list",
    open_in: "inline",
    hint: "If 404 or empty, the build silently failed.",
  },
  // scan_image is intentionally NOT in this map — it's a mock with no
  // external source of truth.
  deploy_app: {
    label: "Open the deployed app",
    // env→port mapping handled in _resolveVerifyUrl below
    url: "__deploy_url__",
    open_in: "tab",
    hint: "If the page doesn't load, no real container is running.",
  },

  // ─── Meta ───
  list_mcp_servers: {
    label: "Hit /api/mcp-status directly",
    url: "http://localhost:3001/api/mcp-status",
    open_in: "inline",
  },
};


// ─── URL resolver ───
//
// Returns { url, open_in, label, hint } or null if no verify is possible
// (either no map entry or required argument missing).
window.resolveVerify = function (toolName, args) {
  const spec = window.TOOL_VERIFY_MAP[toolName];
  if (!spec) return null;
  args = args || {};

  // Special template handlers
  let template = spec.url;
  if (template === "__registry_catalog__") {
    const port = (args.registry === "prod") ? 5002 : 5001;
    template = `http://localhost:${port}/v2/_catalog`;
  } else if (template === "__registry_tags__") {
    const port = (args.registry === "prod") ? 5002 : 5001;
    if (!args.image_name) return null;
    template = `http://localhost:${port}/v2/${args.image_name}/tags/list`;
  } else if (template === "__registry_manifest__") {
    const port = (args.registry === "prod") ? 5002 : 5001;
    if (!args.image_name || !args.tag) return null;
    template = `http://localhost:${port}/v2/${args.image_name}/manifests/${args.tag}`;
  } else if (template === "__deploy_url__") {
    const portMap = { dev: 9080, staging: 9081, prod: 9082 };
    const port = portMap[args.environment] || 9082;
    template = `http://localhost:${port}/`;
  }

  // Generic {arg} substitution
  const placeholders = template.match(/\{([a-zA-Z_]+)\}/g) || [];
  for (const ph of placeholders) {
    const key = ph.slice(1, -1);
    const val = args[key];
    if (val === undefined || val === null || val === "") {
      return null;  // can't fill in — skip the button
    }
    template = template.replace(ph, encodeURIComponent(String(val)));
  }

  return {
    url: template,
    open_in: spec.open_in,
    label: spec.label,
    hint: spec.hint || "",
  };
};
