import { Skeleton } from "@/components/ui/Skeleton";

/** Shown while a dynamically-imported tab chunk loads. */
export function TabSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading step">
      <Skeleton className="h-72 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  );
}
