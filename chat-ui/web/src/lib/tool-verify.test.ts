import { describe, it, expect } from 'vitest'
import { verifyFor } from './tool-verify'

// Sanity tests for the per-tool verify map. Pins the URL shape against the
// running lab's real ports so silent renames in the verify file get caught.

const PORT_RE = /:(8001|8002|3000|5001|5002|9080|9081|9082)\b/

describe('tool-verify', () => {
  it('returns null for unknown tools', () => {
    expect(verifyFor('not_a_real_tool')).toBeNull()
  })

  it('scan_image has no verifier (pure mock)', () => {
    expect(verifyFor('scan_image')).toBeNull()
  })

  it('every registered tool produces a localhost URL on a known lab port', () => {
    const cases: { name: string; args: Record<string, unknown> }[] = [
      { name: 'list_users', args: {} },
      { name: 'list_roles', args: {} },
      { name: 'get_user', args: { user_id: 1 } },
      { name: 'get_user_by_username', args: { username: 'alice' } },
      { name: 'create_user', args: {} },
      { name: 'update_user', args: { user_id: 1 } },
      { name: 'deactivate_user', args: { user_id: 5 } },
      { name: 'activate_user', args: { user_id: 5 } },
      { name: 'delete_user', args: {} },
      { name: 'list_gitea_repos', args: {} },
      { name: 'get_gitea_repo', args: { owner: 'mcpadmin', repo: 'sample-app' } },
      { name: 'list_gitea_branches', args: { owner: 'mcpadmin', repo: 'sample-app' } },
      { name: 'get_gitea_file', args: { owner: 'mcpadmin', repo: 'sample-app', filepath: 'app.py', branch: 'main' } },
      { name: 'create_gitea_repo', args: { owner: 'diana', name: 'experiment' } },
      { name: 'create_gitea_branch', args: { owner: 'mcpadmin', repo: 'sample-app' } },
      { name: 'create_gitea_file', args: { owner: 'mcpadmin', repo: 'sample-app', filepath: 'CHANGELOG.md', branch: 'feature/v2' } },
      { name: 'list_registries', args: {} },
      { name: 'list_registry_images', args: { registry: 'dev' } },
      { name: 'list_image_tags', args: { image_name: 'hello-app', registry: 'dev' } },
      { name: 'get_image_manifest', args: { image_name: 'hello-app', tag: 'latest', registry: 'dev' } },
      { name: 'tag_image', args: { image_name: 'hello-app', registry: 'dev' } },
      { name: 'promote_image', args: {} },
      { name: 'list_promotions', args: {} },
      { name: 'get_promotion_status', args: { promotion_id: 1 } },
      { name: 'build_image', args: { image_name: 'hello-app' } },
      { name: 'deploy_app', args: { environment: 'dev' } },
    ]
    for (const c of cases) {
      const spec = verifyFor(c.name)
      expect(spec, `${c.name} missing from verify map`).not.toBeNull()
      const url = spec!.url(c.args)
      expect(url.startsWith('http://localhost:'), `${c.name} URL not localhost: ${url}`).toBe(true)
      expect(PORT_RE.test(url), `${c.name} URL on unknown port: ${url}`).toBe(true)
    }
  })

  it('registry tools route to prod port (5002) when registry=prod', () => {
    expect(verifyFor('list_registry_images')!.url({ registry: 'prod' })).toContain(':5002')
    expect(verifyFor('list_image_tags')!.url({ image_name: 'hello-app', registry: 'prod' })).toContain(':5002')
    expect(verifyFor('list_image_tags')!.url({ image_name: 'hello-app', registry: 'dev' })).toContain(':5001')
  })

  it('deploy_app routes to env-specific port', () => {
    const url = (env: string) => verifyFor('deploy_app')!.url({ environment: env })
    expect(url('dev')).toContain(':9080')
    expect(url('staging')).toContain(':9081')
    expect(url('prod')).toContain(':9082')
  })
})
