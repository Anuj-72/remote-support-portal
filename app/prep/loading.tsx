import { Skeleton } from "@/components/ui/Skeleton";

export default function PrepLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading preparation">
      <div>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="mt-2 h-4 w-80" />
      </div>
      <Skeleton className="h-64 w-full" />
      <Skeleton className="h-20 w-full" />
    </div>
  );
}
