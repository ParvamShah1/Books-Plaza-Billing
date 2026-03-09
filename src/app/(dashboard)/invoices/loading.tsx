export default function InvoicesLoading() {
  return (
    <div className="animate-pulse">
      {/* Page Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="h-7 w-32 bg-gray-200 rounded" />
          <div className="h-4 w-48 bg-gray-100 rounded mt-2" />
        </div>
        <div className="h-9 w-36 bg-gray-200 rounded-lg" />
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-6">
        <div className="h-9 w-40 bg-gray-100 rounded-lg" />
        <div className="h-9 w-56 bg-gray-100 rounded-lg" />
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200">
        {/* Table Header */}
        <div className="flex items-center gap-4 px-6 py-3 border-b border-gray-200">
          <div className="h-4 w-24 bg-gray-200 rounded" />
          <div className="h-4 w-28 bg-gray-200 rounded" />
          <div className="h-4 w-16 bg-gray-200 rounded" />
          <div className="h-4 w-20 bg-gray-200 rounded ml-auto" />
          <div className="h-4 w-20 bg-gray-200 rounded" />
        </div>
        {/* Table Rows */}
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-6 py-4 border-b border-gray-50">
            <div className="h-4 w-20 bg-gray-100 rounded" />
            <div className="h-4 w-32 bg-gray-100 rounded" />
            <div className="h-4 w-24 bg-gray-100 rounded" />
            <div className="h-4 w-16 bg-gray-100 rounded ml-auto" />
            <div className="h-4 w-20 bg-gray-100 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
