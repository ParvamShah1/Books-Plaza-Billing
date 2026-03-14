"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import type { Customer } from "@/lib/types";

interface CustomerFormProps {
  customer?: Customer | null;
  onSubmit: (formData: FormData) => Promise<{ error?: string; success?: boolean }>;
  onSuccess?: () => void;
}

export function CustomerForm({ customer, onSubmit, onSuccess }: CustomerFormProps) {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError("");
    const result = await onSubmit(formData);
    if (result?.error) {
      setError(result.error);
    } else {
      onSuccess?.();
    }
    setLoading(false);
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-neutral-700 mb-1">
          Full Name <span className="text-red-500">*</span>
        </label>
        <input
          name="full_name"
          type="text"
          required
          defaultValue={customer?.full_name || ""}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm"
          placeholder="Customer name"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">
            Phone
          </label>
          <input
            name="phone"
            type="text"
            defaultValue={customer?.phone || ""}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm"
            placeholder="+91 9876543210"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">
            Email
          </label>
          <input
            name="email"
            type="email"
            defaultValue={customer?.email || ""}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm"
            placeholder="customer@example.com"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-neutral-700 mb-1">
          Address
        </label>
        <textarea
          name="address"
          rows={2}
          defaultValue={customer?.address || ""}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm resize-none"
          placeholder="Full address"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-neutral-700 mb-1">
          GST Number
        </label>
        <input
          name="gst_number"
          type="text"
          defaultValue={customer?.gst_number || ""}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm"
          placeholder="22AAAAA0000A1Z5"
        />
      </div>

      <div className="flex justify-end pt-2">
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          {customer ? "Update Customer" : "Add Customer"}
        </button>
      </div>
    </form>
  );
}
