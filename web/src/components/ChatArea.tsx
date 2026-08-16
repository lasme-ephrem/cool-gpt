import { useEffect, useRef } from "react";
import type { Message as MessageType } from "../lib/types";
import { MessageList } from "./MessageList";
import { EmptyState } from "./EmptyState";

export function ChatArea({
  messages,
  onSelectSuggestion
}: {
  messages: MessageType[];
  onSelectSuggestion: (prompt: string) => void;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  return (
    <main className="flex-1 overflow-y-auto">
      {messages.length === 0 ? (
        <EmptyState onSelect={onSelectSuggestion} />
      ) : (
        <div className="py-6">
          <MessageList messages={messages} />
        </div>
      )}
      <div ref={bottomRef} className="h-1" />
    </main>
  );
}
