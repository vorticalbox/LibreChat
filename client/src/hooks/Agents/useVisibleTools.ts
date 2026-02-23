import { useMemo } from 'react';
import { Constants } from 'librechat-data-provider';
import type { TPlugin } from 'librechat-data-provider';

interface VisibleToolsResult {
  toolIds: string[];
}

/**
 * Calculates visible (regular) tool IDs based on the selected tool IDs for an agent.
 * MCP tool IDs are filtered out here because MCP is intentionally not exposed in nanoLibreChat.
 */
export function useVisibleTools(
  selectedToolIds: string[] | undefined,
  regularTools: TPlugin[] | undefined,
): VisibleToolsResult {
  return useMemo(() => {
    const regularToolIds: string[] = [];

    for (const toolId of selectedToolIds ?? []) {
      // Ignore MCP tool ids (server tools are encoded with this delimiter).
      if (toolId.includes(Constants.mcp_delimiter)) {
        continue;
      }
      if (regularTools?.some((t) => t.pluginKey === toolId)) {
        regularToolIds.push(toolId);
      }
    }

    return {
      toolIds: regularToolIds.sort((a, b) => a.localeCompare(b)),
    };
  }, [regularTools, selectedToolIds]);
}

