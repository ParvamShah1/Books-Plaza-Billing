export default function InvoiceDetailLoading() {
  return (
    <div className="animate-pulse">
      {/* Page Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="h-7 w-36 bg-gray-200 rounded" />
          <div className="h-4 w-24 bg-gray-100 rounded mt-2" />
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-20 bg-gray-200 rounded-lg" />
          <div className="h-9 w-32 bg-gray-200 rounded-lg" />
          <div className="h-9 w-20 bg-gray-200 rounded-lg" />
        </div>
      </div>

      {/* A4 Invoice Skeleton */}
      <div className="bg-white border border-gray-200 shadow-sm mx-auto" style={{ width: "210mm", minHeight: "297mm", padding: "12mm 14mm" }}>
        {/* Header */}
        <div className="text-center mb-5 pb-3 border-b-2 border-gray-200">
          <div className="flex items-center justify-center gap-2 mb-2">
            <div className="w-16 h-12 bg-gray-200 rounded" />
            <div className="h-6 w-48 bg-gray-200 rounded" />
          </div>
          <div className="h-3 w-64 bg-gray-100 rounded mx-auto mt-2" />
          <div className="h-3 w-48 bg-gray-100 rounded mx-auto mt-1.5" />
          <div className="h-3 w-40 bg-gray-100 rounded mx-auto mt-1.5" />
        </div>

        {/* Bill To + Invoice Info */}
        <div className="grid grid-cols-2 gap-6 mb-4 pb-3 border-b border-gray-200">
          <div>
            <div className="h-3 w-12 bg-gray-200 rounded mb-2" />
            <div className="h-4 w-40 bg-gray-200 rounded mb-1" />
            <div className="h-3 w-56 bg-gray-100 rounded mb-1" />
            <div className="h-3 w-32 bg-gray-100 rounded" />
          </div>
          <div className="text-right space-y-2">
            <div className="h-4 w-32 bg-gray-200 rounded ml-auto" />
            <div className="h-4 w-28 bg-gray-200 rounded ml-auto" />
          </div>
        </div>

        {/* Items Table */}
        <div className="mb-4">
          <div className="flex gap-4 py-2 border-b-2 border-gray-200 bg-gray-50 px-2">
            {[20, 40, 100, 30, 30, 40, 30, 40].map((w, i) => (
              <div key={i} className="h-3 bg-gray-200 rounded" style={{ width: `${w}px` }} />
            ))}
          </div>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex gap-4 py-2.5 border-b border-gray-50 px-2">
              {[20, 40, 100, 30, 30, 40, 30, 40].map((w, j) => (
                <div key={j} className="h-3 bg-gray-100 rounded" style={{ width: `${w}px` }} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
