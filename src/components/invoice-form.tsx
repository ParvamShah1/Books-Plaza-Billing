"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { createInvoice, updateInvoice } from "@/lib/actions/invoices";
import { calculateInvoiceTotals, formatCurrency } from "@/lib/calculations";
import { bulkProductItemSchema } from "@/lib/validations";
import type { Customer, Entity, Invoice, InvoiceType } from "@/lib/types";
import type { InvoiceItemInput } from "@/lib/validations";
import { Plus, Trash2, Loader2, Upload, Download } from "lucide-react";

interface InvoiceFormProps {
  customers: Customer[];
  entities: Entity[];
  invoice?: Invoice;
}

const emptyItem: InvoiceItemInput = {
  title: "",
  publisher: "",
  quantity: 1,
  price: 0,
  discount: 0,
};

export function InvoiceForm({ customers, entities, invoice }: InvoiceFormProps) {
  const router = useRouter();
  const isEditing = !!invoice;
  const [entityId, setEntityId] = useState(invoice?.entity_id || entities[0]?.id || "");
  const [type, setType] = useState<InvoiceType>(invoice?.type || "TAX_INVOICE");
  const [customerId, setCustomerId] = useState(invoice?.customer_id || "");
  const [freightCharges, setFreightCharges] = useState(invoice?.freight_charges || 0);
  const [showTotal, setShowTotal] = useState(invoice?.show_total ?? true);
  const [notes, setNotes] = useState(invoice?.notes || "");
  const [items, setItems] = useState<InvoiceItemInput[]>(
    invoice?.items?.map((item) => ({
      title: item.title,
      publisher: item.publisher || "",
      quantity: item.quantity,
      price: item.price,
      discount: item.discount,
    })) || [{ ...emptyItem }]
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const totals = useMemo(() => calculateInvoiceTotals(items), [items]);

  function updateItem(index: number, field: keyof InvoiceItemInput, value: string | number) {
    setItems((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  }

  function addItem() {
    setItems((prev) => [...prev, { ...emptyItem }]);
  }

  function removeItem(index: number) {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function handleExcelUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const data = evt.target?.result;
      const workbook = XLSX.read(data, { type: "binary" });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

      const newItems: InvoiceItemInput[] = [];
      for (const row of json) {
        const normalized: Record<string, unknown> = {};
        Object.entries(row).forEach(([key, value]) => {
          const normalizedKey = key.toLowerCase().trim().replace(/\s+/g, "_");
          normalized[normalizedKey] = typeof value === "string" ? value.trim() : value;
        });

        const result = bulkProductItemSchema.safeParse(normalized);
        if (result.success) {
          newItems.push(result.data);
        }
      }

      if (newItems.length > 0) {
        setItems((prev) => {
          const hasOnlyEmpty = prev.length === 1 && !prev[0].title;
          return hasOnlyEmpty ? newItems : [...prev, ...newItems];
        });
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = "";
  }

  async function handleSubmit() {
    setLoading(true);
    setError("");

    const payload = {
      entity_id: entityId,
      type,
      customer_id: customerId,
      freight_charges: freightCharges,
      show_total: type === "DELIVERY_CHALLAN" ? showTotal : true,
      notes,
      items,
    };

    const result = isEditing
      ? await updateInvoice(invoice.id, payload)
      : await createInvoice(payload);

    if (result?.error) {
      setError(result.error);
      setLoading(false);
    } else if (result?.id) {
      router.push(`/invoices/${result.id}`);
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Invoice Details */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-sm font-semibold text-neutral-900 mb-4">Invoice Details</h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              Billing Entity <span className="text-red-500">*</span>
            </label>
            <select
              value={entityId}
              onChange={(e) => setEntityId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm"
            >
              <option value="">Select entity</option>
              {entities.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              Invoice Type
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as InvoiceType)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm"
            >
              <option value="TAX_INVOICE">Tax Invoice</option>
              <option value="DELIVERY_CHALLAN">Delivery Challan</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              Customer <span className="text-red-500">*</span>
            </label>
            <select
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm"
            >
              <option value="">Select a customer</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name} {c.phone ? `(${c.phone})` : ""}
                </option>
              ))}
            </select>
          </div>
        </div>

        {type === "DELIVERY_CHALLAN" && (
          <div className="mt-4">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showTotal}
                onChange={(e) => setShowTotal(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-orange-500 focus:ring-orange-500"
              />
              <span className="text-sm font-medium text-neutral-700">Show total amount in delivery challan</span>
            </label>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              Freight Charges
            </label>
            <input
              type="number"
              min="0"
              step="1"
              value={freightCharges}
              onChange={(e) => setFreightCharges(parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm"
              placeholder="0"
            />
          </div>
        </div>

        <div className="mt-4">
          <label className="block text-sm font-medium text-neutral-700 mb-1">
            Notes
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm resize-none"
            placeholder="Any additional notes..."
          />
        </div>
      </div>

      {/* Items */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <h3 className="text-sm font-semibold text-neutral-900">Line Items</h3>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const ws = XLSX.utils.aoa_to_sheet([["title", "publisher", "quantity", "price", "discount"]]);
                ws["!cols"] = [{ wch: 30 }, { wch: 20 }, { wch: 10 }, { wch: 10 }, { wch: 10 }];
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, "Items");
                XLSX.writeFile(wb, "invoice_items_template.xlsx");
              }}
              className="px-3 py-1.5 text-sm font-medium text-neutral-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              Template
            </button>
            <label className="px-3 py-1.5 text-sm font-medium text-orange-500 border border-orange-200 rounded-lg hover:bg-orange-50 transition-colors flex items-center gap-1.5 cursor-pointer">
              <Upload className="w-3.5 h-3.5" />
              Upload Excel
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleExcelUpload}
                className="hidden"
              />
            </label>
            <button
              type="button"
              onClick={addItem}
              className="px-3 py-1.5 text-sm font-medium text-orange-500 border border-orange-200 rounded-lg hover:bg-orange-50 transition-colors flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Item
            </button>
          </div>
        </div>

        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left pb-2 text-xs font-medium text-neutral-500 w-8">#</th>
                <th className="text-left pb-2 text-xs font-medium text-neutral-500">Title *</th>
                <th className="text-left pb-2 text-xs font-medium text-neutral-500 w-28">Publisher</th>
                <th className="text-left pb-2 text-xs font-medium text-neutral-500 w-24">Qty</th>
                <th className="text-left pb-2 text-xs font-medium text-neutral-500 w-24">Rate</th>
                <th className="text-left pb-2 text-xs font-medium text-neutral-500 w-20">Disc%</th>
                <th className="text-right pb-2 text-xs font-medium text-neutral-500 w-24">Amount</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr key={index} className="border-b border-gray-50 group">
                  <td className="py-1 pr-2 text-xs text-neutral-400 align-middle">{index + 1}</td>
                  <td className="py-1 pr-2">
                    <input
                      type="text"
                      value={item.title}
                      onChange={(e) => updateItem(index, "title", e.target.value)}
                      className="w-full px-2 py-1.5 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-transparent text-sm"
                      placeholder="Book title"
                    />
                  </td>
                  <td className="py-1 pr-2">
                    <input
                      type="text"
                      value={item.publisher}
                      onChange={(e) => updateItem(index, "publisher", e.target.value)}
                      className="w-full px-2 py-1.5 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-transparent text-sm"
                      placeholder="Pub"
                    />
                  </td>
                  <td className="py-1 pr-2">
                    <input
                      type="number"
                      min="1"
                      value={item.quantity || ""}
                      onChange={(e) => updateItem(index, "quantity", e.target.value === "" ? 0 : parseInt(e.target.value))}
                      onBlur={() => { if (!item.quantity) updateItem(index, "quantity", 1); }}
                      className="w-full px-2 py-1.5 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-transparent text-sm"
                    />
                  </td>
                  <td className="py-1 pr-2">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.price}
                      onChange={(e) => updateItem(index, "price", parseFloat(e.target.value) || 0)}
                      className="w-full px-2 py-1.5 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-transparent text-sm"
                    />
                  </td>
                  <td className="py-1 pr-2">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={item.discount}
                      onChange={(e) => updateItem(index, "discount", parseFloat(e.target.value) || 0)}
                      className="w-full px-2 py-1.5 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-transparent text-sm"
                    />
                  </td>
                  <td className="py-1 pr-2 text-right text-sm font-medium text-neutral-700 align-middle">
                    {formatCurrency(totals.items[index]?.amount || 0)}
                  </td>
                  <td className="py-1 align-middle">
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeItem(index)}
                        className="p-1 rounded hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-400" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden space-y-4">
          {items.map((item, index) => (
            <div key={index} className="border border-gray-200 rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-neutral-500">Item {index + 1}</span>
                {items.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeItem(index)}
                    className="p-1 rounded hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-400" />
                  </button>
                )}
              </div>
              <input
                type="text"
                value={item.title}
                onChange={(e) => updateItem(index, "title", e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-transparent text-sm"
                placeholder="Book title *"
              />
              <input
                type="text"
                value={item.publisher}
                onChange={(e) => updateItem(index, "publisher", e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-transparent text-sm"
                placeholder="Publisher"
              />
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs text-neutral-500 mb-1">Qty</label>
                  <input
                    type="number"
                    min="1"
                    value={item.quantity || ""}
                    onChange={(e) => updateItem(index, "quantity", e.target.value === "" ? 0 : parseInt(e.target.value))}
                    onBlur={() => { if (!item.quantity) updateItem(index, "quantity", 1); }}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-transparent text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-neutral-500 mb-1">Rate</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.price}
                    onChange={(e) => updateItem(index, "price", parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-transparent text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-neutral-500 mb-1">Disc%</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={item.discount}
                    onChange={(e) => updateItem(index, "discount", parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-transparent text-sm"
                  />
                </div>
              </div>
              <div className="text-right text-sm font-medium text-neutral-700">
                Amount: {formatCurrency(totals.items[index]?.amount || 0)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Totals */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-sm font-semibold text-neutral-900 mb-4">Summary</h3>

        <div className="space-y-2 max-w-sm ml-auto">
          <div className="flex justify-between text-sm">
            <span className="text-neutral-500">Subtotal</span>
            <span className="font-medium">{formatCurrency(totals.subtotal)}</span>
          </div>
          {freightCharges > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500">Freight Charges</span>
              <span className="font-medium">{formatCurrency(freightCharges)}</span>
            </div>
          )}

          <div className="border-t border-gray-200 pt-2 mt-2">
            <div className="flex justify-between text-base">
              <span className="font-semibold text-neutral-900">NET Amount Payable</span>
              <span className="font-bold text-orange-500">
                {formatCurrency(Math.round(totals.grand_total + freightCharges))}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Submit */}
      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-neutral-700 hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading}
          className="px-6 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          {isEditing ? "Update Invoice" : "Create Invoice"}
        </button>
      </div>
    </div>
  );
}
