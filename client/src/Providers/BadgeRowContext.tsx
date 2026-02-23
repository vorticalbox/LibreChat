import React, { createContext, useContext, useEffect, useMemo, useRef } from 'react';
import { useSetRecoilState } from 'recoil';
import { Tools, Constants, LocalStorageKeys, AgentCapabilities } from 'librechat-data-provider';
import type { TAgentsEndpoint } from 'librechat-data-provider';
import {
  useSearchApiKeyForm,
  useGetAgentsConfig,
  useCodeApiKeyForm,
  useToolToggle,
} from '~/hooks';
import { getTimestampedValue } from '~/utils/timestamps';
import { useGetStartupConfig } from '~/data-provider';
import { ephemeralAgentByConvoId } from '~/store';

interface BadgeRowContextType {
  conversationId?: string | null;
  storageContextKey?: string;
  agentsConfig?: TAgentsEndpoint | null;
  webSearch: ReturnType<typeof useToolToggle>;
  artifacts: ReturnType<typeof useToolToggle>;
  fileSearch: ReturnType<typeof useToolToggle>;
  codeInterpreter: ReturnType<typeof useToolToggle>;
  codeApiKeyForm: ReturnType<typeof useCodeApiKeyForm>;
  searchApiKeyForm: ReturnType<typeof useSearchApiKeyForm>;
}

const BadgeRowContext = createContext<BadgeRowContextType | undefined>(undefined);

export function useBadgeRowContext() {
  const context = useContext(BadgeRowContext);
  if (context === undefined) {
    throw new Error('useBadgeRowContext must be used within a BadgeRowProvider');
  }
  return context;
}

interface BadgeRowProviderProps {
  children: React.ReactNode;
  isSubmitting?: boolean;
  conversationId?: string | null;
  specName?: string | null;
}

export default function BadgeRowProvider({
  children,
  isSubmitting,
  conversationId,
  specName,
}: BadgeRowProviderProps) {
  const lastContextKeyRef = useRef<string>('');
  const hasInitializedRef = useRef(false);
  const { agentsConfig } = useGetAgentsConfig();
  const { data: startupConfig } = useGetStartupConfig();
  const key = conversationId ?? Constants.NEW_CONVO;
  const hasModelSpecs = (startupConfig?.modelSpecs?.list?.length ?? 0) > 0;

  /**
   * Compute the storage context key for non-spec persistence:
   * - `__defaults__`: specs configured but none active → shared defaults key
   * - undefined: spec active (no persistence) or no specs configured (original behavior)
   *
   * When a spec is active, tool state is NOT persisted — the admin's spec
   * configuration is always applied fresh. Only non-spec user preferences persist.
   */
  const storageContextKey = useMemo(() => {
    if (!specName && hasModelSpecs) {
      return Constants.spec_defaults_key as string;
    }
    return undefined;
  }, [specName, hasModelSpecs]);

  /**
   * Compute the storage suffix for reading localStorage defaults:
   * - New conversations read from environment key (spec or non-spec defaults)
   * - Existing conversations read from conversation key (per-conversation state)
   */
  const isNewConvo = key === Constants.NEW_CONVO;
  const storageSuffix = isNewConvo && storageContextKey ? storageContextKey : key;

  const setEphemeralAgent = useSetRecoilState(ephemeralAgentByConvoId(key));

  /** Initialize ephemeralAgent from localStorage on mount and when conversation/spec changes.
   *  Skipped when a spec is active — applyModelSpecEphemeralAgent handles both new conversations
   *  (pure spec values) and existing conversations (spec values + localStorage overrides). */
  useEffect(() => {
    if (isSubmitting) {
      return;
    }
    if (specName) {
      // Spec active: applyModelSpecEphemeralAgent handles all state (spec base + localStorage
      // overrides for existing conversations). Reset init flag so switching back to non-spec
      // triggers a fresh re-init.
      hasInitializedRef.current = false;
      return;
    }
    // Check if this is a new conversation/spec or the first load
    if (!hasInitializedRef.current || lastContextKeyRef.current !== storageSuffix) {
      hasInitializedRef.current = true;
      lastContextKeyRef.current = storageSuffix;

      const codeToggleKey = `${LocalStorageKeys.LAST_CODE_TOGGLE_}${storageSuffix}`;
      const webSearchToggleKey = `${LocalStorageKeys.LAST_WEB_SEARCH_TOGGLE_}${storageSuffix}`;
      const fileSearchToggleKey = `${LocalStorageKeys.LAST_FILE_SEARCH_TOGGLE_}${storageSuffix}`;
      const artifactsToggleKey = `${LocalStorageKeys.LAST_ARTIFACTS_TOGGLE_}${storageSuffix}`;

      const codeToggleValue = getTimestampedValue(codeToggleKey);
      const webSearchToggleValue = getTimestampedValue(webSearchToggleKey);
      const fileSearchToggleValue = getTimestampedValue(fileSearchToggleKey);
      const artifactsToggleValue = getTimestampedValue(artifactsToggleKey);

      const initialValues: Partial<Record<string, boolean>> = {};

      if (codeToggleValue !== null) {
        try {
          const parsed = JSON.parse(codeToggleValue);
          if (typeof parsed === 'boolean') {
            initialValues[Tools.execute_code] = parsed;
          }
        } catch (e) {
          console.error('Failed to parse code toggle value:', e);
        }
      }

      if (webSearchToggleValue !== null) {
        try {
          const parsed = JSON.parse(webSearchToggleValue);
          if (typeof parsed === 'boolean') {
            initialValues[Tools.web_search] = parsed;
          }
        } catch (e) {
          console.error('Failed to parse web search toggle value:', e);
        }
      }

      if (fileSearchToggleValue !== null) {
        try {
          const parsed = JSON.parse(fileSearchToggleValue);
          if (typeof parsed === 'boolean') {
            initialValues[Tools.file_search] = parsed;
          }
        } catch (e) {
          console.error('Failed to parse file search toggle value:', e);
        }
      }

      if (artifactsToggleValue !== null) {
        try {
          const parsed = JSON.parse(artifactsToggleValue);
          if (typeof parsed === 'boolean') {
            initialValues[AgentCapabilities.artifacts] = parsed;
          }
        } catch (e) {
          console.error('Failed to parse artifacts toggle value:', e);
        }
      }

      const hasOverrides = Object.keys(initialValues).length > 0;

      setEphemeralAgent((prev) => {
        if (prev == null) {
          /** ephemeralAgent is null — use localStorage defaults */
          if (hasOverrides) {
            return { ...initialValues };
          }
          return prev;
        }
        /** ephemeralAgent already has values (from prior state).
         *  Only fill in undefined keys from localStorage. */
        let changed = false;
        const result = { ...prev };
        for (const [toolKey, value] of Object.entries(initialValues)) {
          if (result[toolKey] === undefined) {
            result[toolKey] = value;
            changed = true;
          }
        }
        return changed ? result : prev;
      });
    }
  }, [storageSuffix, specName, isSubmitting, setEphemeralAgent]);

  /** CodeInterpreter hooks */
  const codeApiKeyForm = useCodeApiKeyForm({});
  const { setIsDialogOpen: setCodeDialogOpen } = codeApiKeyForm;

  const codeInterpreter = useToolToggle({
    conversationId,
    storageContextKey,
    setIsDialogOpen: setCodeDialogOpen,
    toolKey: Tools.execute_code,
    localStorageKey: LocalStorageKeys.LAST_CODE_TOGGLE_,
    authConfig: {
      toolId: Tools.execute_code,
      queryOptions: { retry: 1 },
    },
  });

  /** WebSearch hooks */
  const searchApiKeyForm = useSearchApiKeyForm({});
  const { setIsDialogOpen: setWebSearchDialogOpen } = searchApiKeyForm;

  const webSearch = useToolToggle({
    conversationId,
    storageContextKey,
    toolKey: Tools.web_search,
    localStorageKey: LocalStorageKeys.LAST_WEB_SEARCH_TOGGLE_,
    setIsDialogOpen: setWebSearchDialogOpen,
    authConfig: {
      toolId: Tools.web_search,
      queryOptions: { retry: 1 },
    },
  });

  /** FileSearch hook */
  const fileSearch = useToolToggle({
    conversationId,
    storageContextKey,
    toolKey: Tools.file_search,
    localStorageKey: LocalStorageKeys.LAST_FILE_SEARCH_TOGGLE_,
    isAuthenticated: true,
  });

  /** Artifacts hook - using a custom key since it's not a Tool but a capability */
  const artifacts = useToolToggle({
    conversationId,
    storageContextKey,
    toolKey: AgentCapabilities.artifacts,
    localStorageKey: LocalStorageKeys.LAST_ARTIFACTS_TOGGLE_,
    isAuthenticated: true,
  });

  const value: BadgeRowContextType = {
    webSearch,
    artifacts,
    fileSearch,
    agentsConfig,
    conversationId,
    storageContextKey,
    codeApiKeyForm,
    codeInterpreter,
    searchApiKeyForm,
  };

  return <BadgeRowContext.Provider value={value}>{children}</BadgeRowContext.Provider>;
}
