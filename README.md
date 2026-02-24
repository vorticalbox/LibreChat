# libreNano (Raspberry Pi 3 Fork)

This repository is a heavily trimmed upstream fork focused on running on a Raspberry Pi 3 (1GB RAM) with a small, practical feature set.

Upstream project:

- https://github.com/danny-avila/LibreChat
- https://docs.librechat.ai

## Why This Exists

This fork is for a low-resource, local-network deployment where reliability and low memory usage matter more than full platform coverage.

Goals:

- Keep the frontend experience and core chat UX.
- Keep only the features we actually use.
- Remove integrations that add weight but provide no value in this deployment.
- Reduce Docker image size and runtime memory pressure for Pi 3 hardware.

## Scope (Small, Intentional Feature Set)

### Kept

- OpenAI endpoint support
- Jina web search
- Agents, Prompts, Memories
- Frontend UI with paginated chat loading
  - Initial load: latest 10 messages
  - Older messages loaded on scroll
- Local auth and local file workflows needed for this profile

### Removed or Disabled for This Profile

- Meilisearch
- Email flows (verification/reset/invite mail delivery)
- Cloud storage providers (S3 / Azure Blob / Firebase)
- Unused social auth providers
- Extra side-service containers in default compose profile
- Optional integrations not used by this deployment

## Optimization Strategy

This fork prefers **actual removals** over “stubbed placeholders” where possible:

- Runtime paths for removed features were cut out.
- Unused services/routes/modules were deleted.
- Schema/plugin artifacts for removed features were cleaned up.
- Docker runtime was optimized for size and Pi-friendly memory use.

## Current Image Result

Using `Dockerfile.optimized`:

- Current measured image size: **~470 MB** (arm64 build environment)
- Size will vary by architecture/base layers

## Run

```bash
docker compose build api
docker compose up -d api
docker compose logs -f api
```

## Deployment Files

- `docker-compose.yml`
- `docker-compose.override.yml`
- `librechat.yaml`
- `.env`
