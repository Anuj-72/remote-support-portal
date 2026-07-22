"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";

/**
 * Controlled input; disabled (with reason) whenever the channel is not
 * ready for user input — expert typing, connecting, or conversation done.
 */
export function ChatInput({
  canSend,
  onSend,
  placeholder = "Type your reply…",
}: {
  canSend: boolean;
  onSend: (text: string) => void;
  placeholder?: string;
}) {
  const [value, setValue] = useState("");

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSend || !value.trim()) return;
    onSend(value);
    setValue("");
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 border-t border-slate-200 p-3 dark:border-slate-700">
      <input
        type="text"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={canSend ? placeholder : "Waiting for the expert…"}
        disabled={!canSend}
        aria-label="Message to expert"
        className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 dark:border-slate-600 dark:bg-slate-900 dark:focus:border-blue-400 dark:disabled:bg-slate-800"
      />
      <Button type="submit" disabled={!canSend || !value.trim()}>
        Send
      </Button>
    </form>
  );
}
