# MCP DevOps Lab - API Endpoints Reference

## Service Status Summary

| Service | Port | Status | Health Check |
|---------|------|--------|--------------|
| User API | 8001 | ✅ Running | `http://localhost:8001/health` |
| Promotion Service | 8002 | ✅ Running | `http://localhost:8002/health` |
| MCP Server | 8003 | ✅ Running | Uses SSE transport |
| Chat UI | 3001 | ✅ Running | `http://localhost:3001/api/tools` |
| Gitea | 3000 | ✅ Running | `http://localhost:3000/api/v1/version` |
| Registry Dev | 5001 | ✅ Running | `http://localhost:5001/v2/_catalog` |
| Registry Prod | 5002 | ✅ Running | `http://localhost:5002/v2/_catalog` |

---

## Web Interfaces

### Chat UI
- **URL**: http://localhost:3001
- **Description**: Web-based chat interface for interacting with MCP tools via LLM
- **Features**: Supports Ollama, OpenAI, Anthropic, and Google Gemini

### Gitea
- **URL**: http://localhost:3000
- **Credentials**: `mcpadmin` / `mcpadmin123`
- **Description**: Git repository hosting service
- **Features**: Repository management, branch operations, file editing

---

## REST API Endpoints

### User API (Port 8001)

**Base URL**: `http://localhost:8001`

#### Endpoints
```bash
# Health check
GET http://localhost:8001/health
Response: {"status":"ok","service":"user-api"}

# List all users
GET http://localhost:8001/users
Response: Array of user objects

# Get user by ID
GET http://localhost:8001/users/{user_id}

# Create user
POST http://localhost:8001/users
Body: {"name": "string", "email": "string", "role": "string"}

# Update user
PUT http://localhost:8001/users/{user_id}
Body: {"name": "string", "email": "string", "role": "string"}

# Delete user
DELETE http://localhost:8001/users/{user_id}

# Interactive API documentation
GET http://localhost:8001/docs
```

#### Example cURL Commands
```bash
# List users
curl http://localhost:8001/users

# Create a user
curl -X POST http://localhost:8001/users \
  -H "Content-Type: application/json" \
  -d '{"name":"John Doe","email":"john@example.com","role":"developer"}'
```

---

### Promotion Service (Port 8002)

**Base URL**: `http://localhost:8002`

#### Endpoints
```bash
# Health check
GET http://localhost:8002/health
Response: {"status":"ok","service":"promotion-service"}

# List all promotions
GET http://localhost:8002/promotions
Response: Array of promotion records

# Promote an image from dev to prod
POST http://localhost:8002/promote
Body: {
  "image_name": "string",
  "image_tag": "string",
  "approved_by": "string"
}

# Interactive API documentation
GET http://localhost:8002/docs
```

#### Example cURL Commands
```bash
# List promotions
curl http://localhost:8002/promotions

# Promote an image
curl -X POST http://localhost:8002/promote \
  -H "Content-Type: application/json" \
  -d '{"image_name":"sample-app","image_tag":"v1.0.0","approved_by":"admin"}'
```

---

### MCP Server (Port 8003)

**Base URL**: `http://localhost:8003`

#### Endpoints
```bash
# MCP SSE endpoint (for Chat UI)
GET http://localhost:8003/mcp/

# Note: MCP Server uses Server-Sent Events (SSE) transport
# Direct HTTP requests may return "Not Found" - this is expected
```

#### Available MCP Tools (when enabled in .env)

**User Management** (always on - 6 tools):
- `user_create` - Create a new user
- `user_get` - Get user by ID
- `user_list` - List all users
- `user_update` - Update user details
- `user_delete` - Delete a user
- `user_search` - Search users by criteria

**Git/Gitea** (GITEA_MCP_ENABLED=true - 7 tools):
- `gitea_create_repo` - Create a new repository
- `gitea_list_repos` - List all repositories
- `gitea_create_branch` - Create a new branch
- `gitea_list_branches` - List branches in a repo
- `gitea_get_file` - Get file contents from repo
- `gitea_create_file` - Create a new file in repo
- `gitea_update_file` - Update existing file in repo

**Container Registry** (REGISTRY_MCP_ENABLED=true - 3 tools):
- `registry_list_images` - List images in registry
- `registry_list_tags` - List tags for an image
- `registry_get_manifest` - Get image manifest

**Image Promotion** (PROMOTION_MCP_ENABLED=true - 3 tools):
- `promotion_promote` - Promote image from dev to prod
- `promotion_list` - List promotion history
- `promotion_status` - Check promotion status

---

### Gitea API (Port 3000)

**Base URL**: `http://localhost:3000/api/v1`

#### Endpoints
```bash
# API version
GET http://localhost:3000/api/v1/version
Response: {"version":"1.25.4"}

# Search repositories
GET http://localhost:3000/api/v1/repos/search
Headers: Authorization: token <GITEA_TOKEN>

# List user repositories
GET http://localhost:3000/api/v1/user/repos
Headers: Authorization: token <GITEA_TOKEN>

# Get repository
GET http://localhost:3000/api/v1/repos/{owner}/{repo}

# List branches
GET http://localhost:3000/api/v1/repos/{owner}/{repo}/branches

# Get file contents
GET http://localhost:3000/api/v1/repos/{owner}/{repo}/contents/{filepath}

# Interactive API documentation
GET http://localhost:3000/api/swagger
```

#### Authentication
```bash
# Token from .env file
GITEA_TOKEN=721d9178612f8d6e93a6bf1f7671a8b0afe1326c

# Example authenticated request
curl -H "Authorization: token 721d9178612f8d6e93a6bf1f7671a8b0afe1326c" \
  http://localhost:3000/api/v1/user/repos
```

---

### Container Registry Dev (Port 5001)

**Base URL**: `http://localhost:5001/v2`

#### Endpoints
```bash
# List all images (catalog)
GET http://localhost:5001/v2/_catalog
Response: {"repositories":["sample-app"]}

# List tags for an image
GET http://localhost:5001/v2/{image_name}/tags/list
Response: {"name":"sample-app","tags":["v1.0.0"]}

# Get image manifest
GET http://localhost:5001/v2/{image_name}/manifests/{tag}
Headers: Accept: application/vnd.docker.distribution.manifest.v2+json
```

#### Example cURL Commands
```bash
# List all images
curl http://localhost:5001/v2/_catalog

# List tags for sample-app
curl http://localhost:5001/v2/sample-app/tags/list

# Get manifest
curl -H "Accept: application/vnd.docker.distribution.manifest.v2+json" \
  http://localhost:5001/v2/sample-app/manifests/v1.0.0
```

#### Podman Commands
```bash
# Push image to dev registry
podman push localhost:5001/sample-app:v1.0.0 --tls-verify=false

# Pull image from dev registry
podman pull localhost:5001/sample-app:v1.0.0 --tls-verify=false

# List local images
podman images | grep sample-app
```

---

### Container Registry Prod (Port 5002)

**Base URL**: `http://localhost:5002/v2`

#### Endpoints
```bash
# List all images (catalog)
GET http://localhost:5002/v2/_catalog
Response: {"repositories":[]}  # Empty until images are promoted

# List tags for an image
GET http://localhost:5002/v2/{image_name}/tags/list

# Get image manifest
GET http://localhost:5002/v2/{image_name}/manifests/{tag}
```

#### Example cURL Commands
```bash
# List all images in prod
curl http://localhost:5002/v2/_catalog

# List tags for promoted image
curl http://localhost:5002/v2/sample-app/tags/list
```

---

### Chat UI API (Port 3001)

**Base URL**: `http://localhost:3001`

#### Endpoints
```bash
# List available MCP tools
GET http://localhost:3001/api/tools
Response: Array of available tool definitions

# Set LLM provider
POST http://localhost:3001/api/provider
Body: {"provider": "ollama|openai|anthropic|google"}

# Send chat message
POST http://localhost:3001/api/chat
Body: {"message": "string", "history": []}
```

---

## Current Data Status

### User API
- **Users**: 0 (empty database)

### Registry Dev
- **Images**: 1
  - `sample-app:v1.0.0` (Alpine Linux 3.19)

### Registry Prod
- **Images**: 0 (no promotions yet)

### Promotion Service
- **Promotions**: 0 (no promotion history)

### Gitea
- **Repositories**: Check via web UI at http://localhost:3000
- **Admin user**: `mcpadmin` / `mcpadmin123`

---

## Quick Test Commands

### Test all health endpoints
```bash
curl http://localhost:8001/health
curl http://localhost:8002/health
curl http://localhost:3000/api/v1/version
curl http://localhost:5001/v2/_catalog
curl http://localhost:5002/v2/_catalog
curl http://localhost:3001/api/tools
```

### Test registry operations
```bash
# Dev registry
curl http://localhost:5001/v2/_catalog
curl http://localhost:5001/v2/sample-app/tags/list

# Prod registry
curl http://localhost:5002/v2/_catalog
```

### Test promotion workflow
```bash
# 1. Check dev registry
curl http://localhost:5001/v2/sample-app/tags/list

# 2. Promote image
curl -X POST http://localhost:8002/promote \
  -H "Content-Type: application/json" \
  -d '{"image_name":"sample-app","image_tag":"v1.0.0","approved_by":"admin"}'

# 3. Verify in prod registry
curl http://localhost:5002/v2/sample-app/tags/list

# 4. Check promotion history
curl http://localhost:8002/promotions
```

---

## Configuration

### Enable MCP Features
Edit `.env` file:
```bash
GITEA_MCP_ENABLED=true
REGISTRY_MCP_ENABLED=true
PROMOTION_MCP_ENABLED=true
```

Then restart MCP server:
```bash
podman compose restart mcp-server
```

### LLM Provider Configuration
Edit `.env` file:
```bash
LLM_PROVIDER=ollama          # Options: ollama, openai, anthropic, google
LLM_API_KEY=                 # Required for openai/anthropic/google
LLM_MODEL=                   # Optional: override default model
OLLAMA_URL=http://host.containers.internal:11434  # For Podman on macOS
```

---

## Troubleshooting

### Service not responding
```bash
# Check service status
podman compose ps

# Check service logs
podman compose logs <service-name>

# Restart specific service
podman compose restart <service-name>
```

### Registry connection issues
```bash
# Use --tls-verify=false for local registries
podman push localhost:5001/image:tag --tls-verify=false
podman pull localhost:5001/image:tag --tls-verify=false
```

### Gitea token issues
```bash
# Check bootstrap logs for token
podman compose logs bootstrap | grep GITEA_TOKEN

# Update .env with correct token
# Then restart mcp-server
podman compose restart mcp-server
```

### Ollama connection issues
```bash
# Check if Ollama is running
ps aux | grep ollama

# Verify Ollama is accessible
curl http://localhost:11434/api/version

# For Podman, ensure .env uses:
OLLAMA_URL=http://host.containers.internal:11434
```

---

## Additional Resources

- **OpenAPI/Swagger Docs**:
  - User API: http://localhost:8001/docs
  - Promotion Service: http://localhost:8002/docs
  - Gitea API: http://localhost:3000/api/swagger

- **Lab Documentation**:
  - Main README: `README.md`
  - Lab Guide: `docs/LAB_GUIDE.md`
  - Phase 1: `docs/PHASE_1.md`
  - Phase 2: `docs/PHASE_2.md`
  - Phase 3: `docs/PHASE_3.md`
