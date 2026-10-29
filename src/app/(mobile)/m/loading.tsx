// Shown instantly while the overview loads
export default function Loading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-8 w-20 rounded-full bg-gray-200" />
        ))}
      </div>
      <div className="glass-card rounded-2xl h-36" />
      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="glass-card rounded-xl h-16" />
        ))}
      </div>
      <div className="glass-card rounded-2xl h-44" />
      <div className="glass-card rounded-2xl h-56" />
    </div>
  );
}
