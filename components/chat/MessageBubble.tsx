"use client";

import type { ChatMessage } from "@/lib/session-store";

export function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.role === "system") {
    return (
      <p className="my-2 text-center text-xs italic text-slate-400 dark:text-slate-500">
        {message.text}
      </p>
    );
  }
  const isUser = message.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
          isUser
            ? "rounded-br-sm bg-blue-600 text-white"
            : "rounded-bl-sm bg-slate-200 text-slate-900 dark:bg-slate-700 dark:text-slate-100"
        }`}
      >
        {message.text}
      </div>
    </div>
  );
}
