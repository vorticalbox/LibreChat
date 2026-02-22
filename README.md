# LibreChat (Raspberry Pi 3 Fork)

This repository is a customized fork of LibreChat optimized for running on a Raspberry Pi 3 (1GB RAM) in an API-first deployment.

Original project:
- https://github.com/danny-avila/LibreChat
- https://docs.librechat.ai

## Purpose

This fork is tuned for low-memory self-hosting on Raspberry Pi hardware.

## Added

- Jina AI web search provider integration in the backend web search path.
- Paginated chat loading in the frontend.
- Initial conversation load is limited to the latest 10 messages.
- Older messages are loaded on scroll.
- Frontend message-cache hardening to prevent `messageId` undefined crashes during streaming/finalization on long chats.
- API-only Docker defaults for this low-memory target.

## Removed or Disabled (Deployment)

- Removed side-service containers from default runtime in `docker-compose.yml` for this setup.
- Disabled local search path at runtime via `SEARCH=false`.
- Uses external MongoDB Atlas instead of a local Mongo container.
- RAG/vector features are still present in source, but not enabled in this deployment profile.

## Deployment Files Used

- `docker-compose.yml`
- `docker-compose.override.yml`
- `librechat.yaml`
- `.env`

## Run (API only)

```bash
docker compose build api
docker compose up -d api
docker compose logs -f api
```
