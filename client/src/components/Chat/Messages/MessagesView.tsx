import { useState, useRef, useCallback } from 'react';
import { useAtomValue } from 'jotai';
import { useRecoilValue } from 'recoil';
import { CSSTransition } from 'react-transition-group';
import type { TMessage } from 'librechat-data-provider';
import { useScreenshot, useMessageScrolling, useLocalize } from '~/hooks';
import ScrollToBottom from '~/components/Messages/ScrollToBottom';
import { MessagesViewProvider } from '~/Providers';
import { fontSizeAtom } from '~/store/fontSize';
import MultiMessage from './MultiMessage';
import { cn } from '~/utils';
import store from '~/store';

interface MessagesViewProps {
  messagesTree?: TMessage[] | null;
  onLoadMore?: () => Promise<void>;
  hasMore?: boolean;
  isLoadingMore?: boolean;
}

function MessagesViewContent({
  messagesTree: _messagesTree,
  onLoadMore,
  hasMore = false,
  isLoadingMore = false,
}: MessagesViewProps) {
  const localize = useLocalize();
  const fontSize = useAtomValue(fontSizeAtom);
  const { screenshotTargetRef } = useScreenshot();
  const scrollButtonPreference = useRecoilValue(store.showScrollButton);
  const [currentEditId, setCurrentEditId] = useState<number | string | null>(-1);
  const scrollToBottomRef = useRef<HTMLButtonElement>(null);
  const loadingOlderRef = useRef(false);

  const {
    conversation,
    scrollableRef,
    messagesEndRef,
    showScrollButton,
    handleSmoothToRef,
    debouncedHandleScroll,
  } = useMessageScrolling(_messagesTree);

  const { conversationId } = conversation ?? {};

  const loadMoreIfNeeded = useCallback(() => {
    const container = scrollableRef.current;
    if (
      !container ||
      !onLoadMore ||
      !hasMore ||
      isLoadingMore ||
      loadingOlderRef.current ||
      container.scrollTop > 120
    ) {
      return;
    }

    loadingOlderRef.current = true;
    const previousScrollHeight = container.scrollHeight;
    const previousScrollTop = container.scrollTop;

    void onLoadMore()
      .then(() => {
        requestAnimationFrame(() => {
          const currentContainer = scrollableRef.current;
          if (!currentContainer) {
            return;
          }

          const nextScrollHeight = currentContainer.scrollHeight;
          currentContainer.scrollTop =
            previousScrollTop + (nextScrollHeight - previousScrollHeight);
        });
      })
      .finally(() => {
        loadingOlderRef.current = false;
      });
  }, [hasMore, isLoadingMore, onLoadMore, scrollableRef]);

  const handleScroll = useCallback(() => {
    debouncedHandleScroll();
    loadMoreIfNeeded();
  }, [debouncedHandleScroll, loadMoreIfNeeded]);

  return (
    <>
      <div className="relative flex-1 overflow-hidden overflow-y-auto">
        <div className="relative h-full">
          <div
            className="scrollbar-gutter-stable"
            onScroll={handleScroll}
            ref={scrollableRef}
            style={{
              height: '100%',
              overflowY: 'auto',
              width: '100%',
            }}
          >
            <div className="flex flex-col pb-9 pt-14 dark:bg-transparent">
              {(_messagesTree && _messagesTree.length == 0) || _messagesTree === null ? (
                <div
                  className={cn(
                    'flex w-full items-center justify-center p-3 text-text-secondary',
                    fontSize,
                  )}
                >
                  {localize('com_ui_nothing_found')}
                </div>
              ) : (
                <>
                  <div ref={screenshotTargetRef}>
                    <MultiMessage
                      key={conversationId}
                      messagesTree={_messagesTree}
                      messageId={conversationId ?? null}
                      setCurrentEditId={setCurrentEditId}
                      currentEditId={currentEditId ?? null}
                    />
                  </div>
                </>
              )}
              <div
                id="messages-end"
                className="group h-0 w-full flex-shrink-0"
                ref={messagesEndRef}
              />
            </div>
          </div>

          <CSSTransition
            in={showScrollButton && scrollButtonPreference}
            timeout={{
              enter: 550,
              exit: 700,
            }}
            classNames="scroll-animation"
            unmountOnExit={true}
            appear={true}
            nodeRef={scrollToBottomRef}
          >
            <ScrollToBottom ref={scrollToBottomRef} scrollHandler={handleSmoothToRef} />
          </CSSTransition>
        </div>
      </div>
    </>
  );
}

export default function MessagesView({
  messagesTree,
  onLoadMore,
  hasMore,
  isLoadingMore,
}: MessagesViewProps) {
  return (
    <MessagesViewProvider>
      <MessagesViewContent
        messagesTree={messagesTree}
        onLoadMore={onLoadMore}
        hasMore={hasMore}
        isLoadingMore={isLoadingMore}
      />
    </MessagesViewProvider>
  );
}
