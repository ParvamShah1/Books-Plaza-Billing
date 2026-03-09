export default function NewInvoiceLoading() {
  return (
    <div className="animate-pulse">
      {/* Page Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="h-7 w-40 bg-gray-200 rounded" />
          <div className="h-4 w-56 bg-gray-100 rounded mt-2" />
        </div>
      </div>

      {/* Invoice Details Card */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <div className="h-5 w-28 bg-gray-200 rounded mb-4" />
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i}>
              <div className="h-4 w-24 bg-gray-100 rounded mb-2" />
              <div className="h-9 w-full bg-gray-100 rounded-lg" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4 mt-4">
          <div>
            <div className="h-4 w-28 bg-gray-100 rounded mb-2" />
            <div className="h-9 w-full bg-gray-100 rounded-lg" />
          </div>
        </div>
      </div>

      {/* Line Items Card */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="h-5 w-24 bg-gray-200 rounded" />
          <div className="flex gap-2">
            <div className="h-8 w-24 bg-gray-100 rounded-lg" />
            <div className="h-8 w-28 bg-gray-100 rounded-lg" />
          </div>
        </div>
        {/* Table header */}
        <div className="flex gap-3 pb-2 border-b border-gray-200 mb-2">
          {[16, 120, 80, 50, 60, 50, 70].map((w, i) => (
            <div key={i} className="h-3 bg-gray-200 rounded" style={{ width: `${w}px` }} />
          ))}
        </div>
        {/* Rows */}
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex gap-3 py-2 border-b border-gray-50">
            {[16, 120, 80, 50, 60, 50, 70].map((w, j) => (
              <div key={j} className="h-8 bg-gray-50 rounded" style={{ width: `${w}px` }} />
            ))}
          </div>
        ))}
      </div>

      {/* Summary Card */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <div className="h-5 w-20 bg-gray-200 rounded mb-4" />
        <div className="space-y-3 max-w-sm ml-auto">
          <div className="flex justify-between">
            <div className="h-4 w-16 bg-gray-100 rounded" />
            <div className="h-4 w-20 bg-gray-100 rounded" />
          </div>
          <div className="border-t border-gray-200 pt-3">
            <div className="flex justify-between">
              <div className="h-5 w-36 bg-gray-200 rounded" />
              <div className="h-5 w-24 bg-gray-200 rounded" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
