import type { Message as MessageType } from "../lib/types";
import { Message } from "./Message";

export function MessageList({ messages }: { messages: MessageType[] }) {
  return (
    <div className="flex flex-col mx-auto w-full max-w-3xl px-4">
      {messages.map((m) => (
        <Message key={m.id} message={m} />
      ))}
    </div>
  );
}
