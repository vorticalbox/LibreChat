import { useMemo, useEffect, useCallback } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseQueryOptions } from '@tanstack/react-query';
import {
  Constants,
  QueryKeys,
  dataService,
  type MessagesListResponse,
  type TMessage,
} from 'librechat-data-provider';

const MESSAGE_PAGE_SIZE = 10;

const hasValidMessageId = (
  message: TMessage | null | undefined,
): message is TMessage & { messageId: string } =>
  typeof message?.messageId === 'string' && message.messageId.length > 0;

const ensureMessageArray = (value: unknown): Array<TMessage | null | undefined> => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value as Array<TMessage | null | undefined>;
};

const sanitizeMessages = (messages: Array<TMessage | null | undefined>): TMessage[] => {
  const sanitized: TMessage[] = [];
  for (const message of messages) {
    if (!hasValidMessageId(message)) {
      continue;
    }
    sanitized.push(message);
  }
  return sanitized;
};

const toCreatedAtTimestamp = (message: TMessage): number => {
  if (!message.createdAt) {
    return Number.POSITIVE_INFINITY;
  }
  return new Date(message.createdAt).getTime();
};

const flattenPagedMessages = (pages: MessagesListResponse[] | undefined): TMessage[] => {
  if (!pages || pages.length === 0) {
    return [];
  }

  const descending: TMessage[] = [];
  for (const page of pages) {
    if (!page || !Array.isArray(page.messages)) {
      continue;
    }
    for (const message of page.messages) {
      if (!hasValidMessageId(message)) {
        continue;
      }
      descending.push(message);
    }
  }

  const dedupDescending: TMessage[] = [];
  const seen = new Set<string>();

  for (const message of descending) {
    const { messageId } = message;
    if (seen.has(messageId)) {
      continue;
    }
    dedupDescending.push(message);
    seen.add(messageId);
  }

  return dedupDescending.reverse();
};

const areMessageListsEqual = (a: TMessage[], b: TMessage[]): boolean => {
  if (a.length !== b.length) {
    return false;
  }

  for (let i = 0; i < a.length; i++) {
    const aMessageId = a[i]?.messageId;
    const bMessageId = b[i]?.messageId;
    if (!aMessageId || !bMessageId || aMessageId !== bMessageId) {
      return false;
    }
  }

  return true;
};

const mergeMessages = (existing: TMessage[], fetched: TMessage[]): TMessage[] => {
  const safeExisting = sanitizeMessages(existing);
  const safeFetched = sanitizeMessages(fetched);

  if (safeExisting.length === 0) {
    return safeFetched;
  }

  if (safeFetched.length === 0) {
    return safeExisting;
  }

  const mergedMap = new Map<string, TMessage>();
  const existingOrderMap = new Map<string, number>();

  for (let i = 0; i < safeExisting.length; i++) {
    existingOrderMap.set(safeExisting[i].messageId, i);
  }

  for (const message of safeFetched) {
    mergedMap.set(message.messageId, message);
  }

  // Existing cache wins for duplicate message IDs to preserve local optimistic/streaming updates.
  for (const message of safeExisting) {
    mergedMap.set(message.messageId, message);
  }

  const merged = Array.from(mergedMap.values());

  merged.sort((a, b) => {
    const aHasCreatedAt = Boolean(a.createdAt);
    const bHasCreatedAt = Boolean(b.createdAt);

    if (!aHasCreatedAt && !bHasCreatedAt) {
      const aIndex = existingOrderMap.get(a.messageId) ?? Number.POSITIVE_INFINITY;
      const bIndex = existingOrderMap.get(b.messageId) ?? Number.POSITIVE_INFINITY;
      if (aIndex === bIndex) {
        return a.messageId.localeCompare(b.messageId);
      }
      return aIndex - bIndex;
    }

    if (!aHasCreatedAt) {
      return 1;
    }

    if (!bHasCreatedAt) {
      return -1;
    }

    const aTime = toCreatedAtTimestamp(a);
    const bTime = toCreatedAtTimestamp(b);

    if (aTime === bTime) {
      return a.messageId.localeCompare(b.messageId);
    }
    return aTime - bTime;
  });

  return merged;
};

type UseMessagesQueryOptions<TData> = Omit<
  UseQueryOptions<TMessage[], unknown, TData>,
  'queryKey' | 'queryFn'
>;

export const useGetMessagesByConvoId = <TData = TMessage[]>(
  id: string,
  config?: UseMessagesQueryOptions<TData>,
) => {
  const queryClient = useQueryClient();

  const isSpecialConversation = !id || id === Constants.NEW_CONVO || id === Constants.PENDING_CONVO;

  const queryEnabled = Boolean(config?.enabled ?? true) && !isSpecialConversation;

  const paginationQuery = useInfiniteQuery<MessagesListResponse>({
    queryKey: [QueryKeys.messages, 'history', id],
    queryFn: ({ pageParam }) =>
      dataService.listMessages({
        conversationId: id,
        cursor: pageParam?.toString(),
        pageSize: MESSAGE_PAGE_SIZE,
        sortBy: 'createdAt',
        sortDirection: 'desc',
      }),
    getNextPageParam: (lastPage) => lastPage?.nextCursor ?? undefined,
    enabled: queryEnabled,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    staleTime: 5 * 60 * 1000,
    cacheTime: 30 * 60 * 1000,
  });

  const fetchedMessages = useMemo(
    () => flattenPagedMessages(paginationQuery.data?.pages),
    [paginationQuery.data?.pages],
  );

  useEffect(() => {
    if (isSpecialConversation) {
      queryClient.setQueryData<TMessage[]>([QueryKeys.messages, id], []);
      return;
    }

    if (!queryEnabled) {
      return;
    }

    queryClient.setQueryData<TMessage[]>([QueryKeys.messages, id], (previous = []) => {
      const safePrevious = sanitizeMessages(ensureMessageArray(previous));
      const merged = mergeMessages(safePrevious, fetchedMessages);
      if (areMessageListsEqual(merged, safePrevious) && safePrevious.length === previous.length) {
        return previous;
      }
      return merged;
    });
  }, [fetchedMessages, id, isSpecialConversation, queryClient, queryEnabled]);

  const messagesQuery = useQuery<TMessage[], unknown, TData>(
    [QueryKeys.messages, id],
    () => {
      const cached = queryClient.getQueryData<TMessage[]>([QueryKeys.messages, id]);
      return Promise.resolve(sanitizeMessages(ensureMessageArray(cached)));
    },
    {
      enabled: Boolean(config?.enabled ?? true),
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      ...config,
    },
  );

  const fetchNextPage = useCallback(async () => {
    if (!queryEnabled || !paginationQuery.hasNextPage || paginationQuery.isFetchingNextPage) {
      return;
    }

    await paginationQuery.fetchNextPage();
  }, [paginationQuery, queryEnabled]);

  const hasLoadedMessages = sanitizeMessages(
    ensureMessageArray(queryClient.getQueryData<TMessage[]>([QueryKeys.messages, id])),
  ).length > 0;

  return {
    ...messagesQuery,
    isLoading: queryEnabled
      ? paginationQuery.isLoading && !hasLoadedMessages
      : messagesQuery.isLoading,
    isFetching: messagesQuery.isFetching || paginationQuery.isFetching,
    isError: messagesQuery.isError || paginationQuery.isError,
    error: messagesQuery.error ?? paginationQuery.error,
    fetchNextPage,
    hasNextPage: Boolean(paginationQuery.hasNextPage),
    isFetchingNextPage: paginationQuery.isFetchingNextPage,
  };
};
