import { describe, it, expect } from 'vitest'
import { promptsFor, titleFor, SUPPORTED_MCPS, allToolsReferenced } from './mcp-prompts'

// Source-of-truth tool inventory. If you add a tool to mcp-server, add it
// here; the alignment test will fail until mcp-prompts.ts has a prompt for
// it. If you remove a tool, remove it here AND any prompt that names it.
const REAL_TOOLS_BY_MCP: Record<string, string[]> = {
  'mcp-user': [
    'list_users', 'list_roles', 'get_user', 'get_user_by_username',
    'create_user', 'update_user',
    'deactivate_user', 'activate_user', 'delete_user',
    // delete_all_users is gated and intentionally NOT surfaced as a Try-It prompt.
  ],
  'mcp-gitea': [
    'list_gitea_repos', 'get_gitea_repo', 'create_gitea_repo',
    'list_gitea_branches', 'create_gitea_branch',
    'get_gitea_file', 'create_gitea_file',
  ],
  'mcp-registry': [
    'list_registry_images', 'list_registries',
    'list_image_tags', 'get_image_manifest', 'tag_image',
  ],
  'mcp-promotion': [
    'promote_image', 'list_promotions', 'get_promotion_status',
  ],
  'mcp-runner': [
    'build_image', 'scan_image', 'deploy_app',
  ],
}

describe('mcp-prompts', () => {
  it('every supported MCP has a friendly title', () => {
    for (const mcp of SUPPORTED_MCPS) {
      expect(titleFor(mcp)).not.toEqual(mcp)
    }
  })

  it('promptsFor accepts both canonical and stripped names', () => {
    expect(promptsFor('mcp-user').length).toBeGreaterThan(0)
    expect(promptsFor('user').length).toBeGreaterThan(0)
    expect(promptsFor('user')).toEqual(promptsFor('mcp-user'))
  })

  it('every prompt references a tool that actually exists in mcp-server', () => {
    const realTools = new Set(Object.values(REAL_TOOLS_BY_MCP).flat())
    for (const tool of allToolsReferenced()) {
      expect(realTools.has(tool), `prompt references non-existent tool "${tool}"`).toBe(true)
    }
  })

  it('every real MCP tool gets at least one prompt', () => {
    const referenced = new Set(allToolsReferenced())
    for (const [mcp, tools] of Object.entries(REAL_TOOLS_BY_MCP)) {
      for (const tool of tools) {
        expect(
          referenced.has(tool),
          `${mcp} tool "${tool}" has no prompt suggestion`,
        ).toBe(true)
      }
    }
  })
})
