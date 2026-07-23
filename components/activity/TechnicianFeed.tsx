/**
 * Left-panel "You" placeholder for the split-screen chat tabs — mirrors the
 * reference mockup (technician feed on the left, remote expert on the right).
 * The live webcam stream itself lives in the Recording tab; in the chat tabs
 * this is a passive placeholder so all three tabs share the same two-column
 * workspace layout. Pure/static — no client JS, no camera request here.
 */
export function TechnicianFeed({ caption }: { caption: string }) {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-slate-200">
      <div className="border-b border-slate-200 px-4 py-2 text-sm font-medium text-slate-700">
        You
      </div>
      <div className="flex flex-1 items-center justify-center bg-slate-100 p-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <span aria-hidden="true" className="text-3xl opacity-60">
            📷
          </span>
          <p className="max-w-[16rem] text-xs text-slate-500">{caption}</p>
        </div>
      </div>
    </div>
  );
}
