import { Skeleton } from "@/components/ui/Skeleton";

export default function ActivityLoading() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading activity">
      <div>
        <Skeleton className="h-8 w-44" />
        <Skeleton className="mt-2 h-4 w-72" />
      </div>
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-11 flex-1" />
        <Skeleton className="h-9 w-20" />
      </div>
      <Skeleton className="h-80 w-full" />
    </div>
  );
}
