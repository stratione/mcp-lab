# Phase 1: Manual Operations (Without MCP)

In this phase, you interact with each system directly via curl. Notice the friction: different authentication, different API formats, manual credential management.

## Exercise 1: User Management

```bash
# Create a user
curl -X POST http://localhost:8001/users \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","email":"alice@example.com","full_name":"Alice Smith","role":"developer"}'

# List all users
curl http://localhost:8001/users

# Get a specific user
curl http://localhost:8001/users/1

# Look up by username
curl http://localhost:8001/users/by-username/alice

# Update a user's role
curl -X PUT http://localhost:8001/users/1 \
  -H "Content-Type: application/json" \
  -d '{"role":"reviewer"}'
```

## Exercise 2: Gitea Repository Management

You need the Gitea admin credentials for every request:

```bash
# List repositories (note: requires auth!)
curl -u mcpadmin:mcpadmin123 http://localhost:3000/api/v1/repos/search | jq '.data[].full_name'

# Create a new repo
curl -X POST -u mcpadmin:mcpadmin123 http://localhost:3000/api/v1/user/repos \
  -H "Content-Type: application/json" \
  -d '{"name":"my-service","description":"A new service","auto_init":true}'

# List branches
curl -u mcpadmin:mcpadmin123 http://localhost:3000/api/v1/repos/mcpadmin/sample-app/branches | jq '.[].name'

# Create a branch
curl -X POST -u mcpadmin:mcpadmin123 http://localhost:3000/api/v1/repos/mcpadmin/sample-app/branches \
  -H "Content-Type: application/json" \
  -d '{"new_branch_name":"feature-x","old_branch_name":"main"}'
```

## Exercise 3: Container Registry

```bash
# List images in dev registry
curl http://localhost:5001/v2/_catalog

# List tags for an image
curl http://localhost:5001/v2/sample-app/tags/list

# Check prod registry (should be empty)
curl http://localhost:5002/v2/_catalog
```

## Exercise 4: Image Promotion

Try to promote an image — notice the policy enforcement:

```bash
# This should FAIL — alice is a developer, not a reviewer
curl -X POST http://localhost:8002/promote \
  -H "Content-Type: application/json" \
  -d '{"image_name":"sample-app","tag":"v1.0.0","promoted_by":"alice"}'

# First, update alice to reviewer role
curl -X PUT http://localhost:8001/users/1 \
  -H "Content-Type: application/json" \
  -d '{"role":"reviewer"}'

# Now try again — this should succeed
curl -X POST http://localhost:8002/promote \
  -H "Content-Type: application/json" \
  -d '{"image_name":"sample-app","tag":"v1.0.0","promoted_by":"alice"}'

# Check the promotion audit log
curl http://localhost:8002/promotions

# Verify image is now in prod
curl http://localhost:5002/v2/sample-app/tags/list
```

## Reflection

Notice the friction points:
- **Multiple API formats** — each system has its own REST conventions
- **Credential management** — Gitea requires auth, registries don't, user API doesn't
- **No workflow** — you manually orchestrated the cross-system flow
- **No policy abstraction** — you had to know the promotion rules
- **Multiple tools** — curl, jq, base64 encoding for Gitea files

Proceed to [Phase 2](PHASE_2.md) to see how MCP addresses these issues.
