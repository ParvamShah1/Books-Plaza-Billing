// Shown instantly while a list page loads
export function PageSkeleton({ stats = false }: { stats?: boolean }) {
  return (
    <div className="animate-pulse">
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="h-7 w-32 bg-gray-200 rounded" />
          <div className="h-4 w-44 bg-gray-100 rounded mt-2" />
        </div>
        <div className="h-9 w-32 bg-gray-200 rounded-lg" />
      </div>

      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="glass-card rounded-xl h-24" />
          ))}
        </div>
      )}

      <div className="h-9 w-80 max-w-full bg-gray-100 rounded-lg mb-4" />

      <div className="glass-card rounded-xl">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-6 py-4 border-b border-gray-50">
            <div className="h-4 w-48 bg-gray-100 rounded" />
            <div className="h-4 w-24 bg-gray-100 rounded" />
            <div className="h-4 w-20 bg-gray-100 rounded" />
            <div className="h-4 w-16 bg-gray-100 rounded ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}
