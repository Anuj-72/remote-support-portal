import { Skeleton } from "@/components/ui/Skeleton";

export default function AnalysisLoading() {
  return (
    <div className="flex flex-col items-center gap-6 py-8" aria-busy="true" aria-label="Loading analysis">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-72 w-full max-w-md" />
      <Skeleton className="h-10 w-44" />
    </div>
  );
}
