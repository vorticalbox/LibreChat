# LibreChat (Raspberry Pi 3 Fork)

This repository is a customized fork of LibreChat optimized for running on a Raspberry Pi 3 (1GB RAM) in an API-first deployment.

Original project:
- https://github.com/danny-avila/LibreChat
- https://docs.librechat.ai

## Purpose

This fork is tuned for low-memory self-hosting on Raspberry Pi hardware.

## Added

- Jina web search provider support (configure `webSearch.searchProvider: jina` + `JINA_API_KEY`).
- Proactive cross-chat memory capture is enabled (`memory.autoCapture: true`) so durable user facts are checked and saved each turn.
- Memory context is now consistently included for the agent run path, even when memory is currently empty.
- Agent attachment handling now supports `file_id`, `temp_file_id`, and `filepath` fallback matching to keep message files attached reliably.
- File usage updates now resolve both final and temporary file IDs, reducing temp-to-final file transition issues.
- Frontend file state handling now remaps temporary IDs to final IDs and includes `temp_file_id` in message payloads.
- Paginated chat loading in the frontend.
- Initial conversation load is limited to the latest 10 messages.
- Older messages are loaded on scroll.
- Frontend message-cache hardening to prevent `messageId` undefined crashes during streaming/finalization on long chats.
- Message listing URL fix: pagination uses `GET /api/messages?conversationId=...` so infinite scroll works reliably.
- The right-side controls panel can no longer be permanently hidden via settings (to prevent getting locked out of Agents/Prompts/Memories).
- API-only Docker defaults for this low-memory target.

## Removed or Disabled (Deployment)

- Removed side-service containers from default runtime in `docker-compose.yml` for this setup.
- Disabled local search path at runtime via `SEARCH=false`.
- Uses external MongoDB Atlas instead of a local Mongo container.
- MCP is removed (frontend UI + backend mounts/entrypoints) to reduce footprint and avoid MCP init/runtime failures.
- WebSearch rerankers are removed (Jina is used directly as the search provider).
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
