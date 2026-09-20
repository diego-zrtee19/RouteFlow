export function ProductCardSkeleton() {
  return (
    <div className="bg-white rounded-2xl overflow-hidden border border-zinc-200 p-4">
      <div className="aspect-square bg-zinc-100 rounded-xl mb-4 animate-shimmer"></div>
      <div className="space-y-3">
        <div className="h-4 bg-zinc-100 rounded-lg animate-shimmer w-3/4"></div>
        <div className="h-3 bg-zinc-100 rounded-lg animate-shimmer w-1/2"></div>
        <div className="h-6 bg-zinc-100 rounded-lg animate-shimmer w-1/3 mt-4"></div>
        <div className="h-10 bg-zinc-100 rounded-xl animate-shimmer mt-4"></div>
      </div>
    </div>
  );
}
