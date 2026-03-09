"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { recordPayment } from "@/lib/actions/payments";
import { formatCurrency } from "@/lib/calculations";
import { Loader2, Plus } from "lucide-react";

interface CustomerPaymentSectionProps {
  customerId: string;
  currentBalance: number;
}

export function CustomerPaymentSection({ customerId, currentBalance }: CustomerPaymentSectionProps) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState("CASH");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    setLoading(true);
    setError("");

    const result = await recordPayment({
      customer_id: customerId,
      amount: parseFloat(amount),
      mode,
      notes,
    });

    if (result?.error) {
      setError(result.error);
      setLoading(false);
    } else {
      setAmount("");
      setNotes("");
      setShowForm(false);
      setLoading(false);
      router.refresh();
    }
  }

  if (!showForm) {
    return (
      <div className="mb-8">
        <button
          onClick={() => setShowForm(true)}
          disabled={currentBalance <= 0}
          className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus className="w-4 h-4" />
          Record Payment
        </button>
      </div>
    );
  }

  return (
    <div className="mb-8 bg-white rounded-lg border border-gray-200 p-6">
      <h3 className="text-sm font-semibold text-neutral-900 mb-4">Record Payment</h3>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm mb-4">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">
            Amount <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            min="1"
            step="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={`Max: ${formatCurrency(currentBalance)}`}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">
            Payment Mode
          </label>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm"
          >
            <option value="CASH">Cash</option>
            <option value="UPI">UPI</option>
            <option value="CARD">Card</option>
            <option value="BANK_TRANSFER">Bank Transfer</option>
            <option value="CHEQUE">Cheque</option>
            <option value="OTHER">Other</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">
            Notes
          </label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional note"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm"
          />
        </div>

        <div className="flex items-end gap-2">
          <button
            onClick={handleSubmit}
            disabled={loading || !amount}
            className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Save
          </button>
          <button
            onClick={() => { setShowForm(false); setError(""); }}
            className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-neutral-700 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
