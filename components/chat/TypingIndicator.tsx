"use client";

export function TypingIndicator() {
  return (
    <div className="flex justify-start" aria-label="Expert is typing">
      <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm bg-slate-200 px-4 py-3 dark:bg-slate-700">
        {[0, 150, 300].map((delay) => (
          <span
            key={delay}
            className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-500 dark:bg-slate-400"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
