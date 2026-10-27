export default function PosLoading() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 lg:h-[calc(100vh-5.75rem)] animate-pulse">
      <div className="lg:col-span-8 glass-card rounded-2xl p-4 space-y-3 min-h-[70vh]">
        <div className="grid grid-cols-3 gap-3">
          <div className="h-14 bg-gray-100 rounded-lg" />
          <div className="h-14 bg-gray-100 rounded-lg" />
          <div className="h-14 bg-gray-100 rounded-lg" />
        </div>
        <div className="h-12 bg-gray-100 rounded-xl" />
      </div>
      <div className="lg:col-span-4 glass-card rounded-2xl p-4 space-y-3 min-h-[50vh]">
        <div className="h-9 bg-gray-100 rounded-lg" />
        <div className="grid grid-cols-2 gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-20 bg-gray-100 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
