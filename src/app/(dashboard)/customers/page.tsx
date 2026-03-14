"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { CustomerForm } from "@/components/customer-form";
import {
  getCustomersWithBalance,
  createCustomer,
  updateCustomer,
  deleteCustomer,
} from "@/lib/actions/customers";
import { formatCurrency } from "@/lib/calculations";
import type { Customer, CustomerWithBalance } from "@/lib/types";
import {
  Users,
  Plus,
  Search,
  Pencil,
  Trash2,
} from "lucide-react";

export default function CustomersPage() {
  const [customers, setCustomers] = useState<CustomerWithBalance[]>([]);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    const data = await getCustomersWithBalance(search || undefined);
    setCustomers(data);
    setLoading(false);
  }, [search]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this customer?")) return;
    await deleteCustomer(id);
    loadCustomers();
  }

  return (
    <div>
      <PageHeader title="Customers" description="Manage your customer database">
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 transition-colors flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Customer
        </button>
      </PageHeader>

      {/* Search */}
      <div className="mb-6">
        <div className="relative w-full sm:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
          <input
            type="text"
            placeholder="Search by name, phone, or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm"
          />
        </div>
      </div>

      {/* Customer List */}
      {loading ? (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden animate-pulse">
          <div className="flex items-center gap-4 px-6 py-3 border-b border-gray-200">
            <div className="h-4 w-32 bg-gray-200 rounded" />
            <div className="h-4 w-24 bg-gray-200 rounded" />
            <div className="h-4 w-20 bg-gray-200 rounded" />
            <div className="h-4 w-28 bg-gray-200 rounded ml-auto" />
            <div className="h-4 w-16 bg-gray-200 rounded" />
          </div>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-6 py-4 border-b border-gray-50">
              <div className="h-4 w-36 bg-gray-100 rounded" />
              <div className="h-4 w-24 bg-gray-100 rounded" />
              <div className="h-4 w-32 bg-gray-100 rounded" />
              <div className="h-4 w-20 bg-gray-100 rounded ml-auto" />
              <div className="h-4 w-16 bg-gray-100 rounded" />
            </div>
          ))}
        </div>
      ) : customers.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No customers yet"
          description="Add your first customer to start creating invoices."
        >
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 transition-colors"
          >
            Add Customer
          </button>
        </EmptyState>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-4 sm:px-6 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="text-left px-4 sm:px-6 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider hidden sm:table-cell">
                  Phone
                </th>
                <th className="text-left px-4 sm:px-6 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider hidden md:table-cell">
                  Email
                </th>
                <th className="text-right px-4 sm:px-6 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  Pending
                </th>
                <th className="text-right px-4 sm:px-6 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {customers.map((customer) => (
                <tr key={customer.id} className="hover:bg-gray-50">
                  <td className="px-4 sm:px-6 py-3 sm:py-4">
                    <Link
                      href={`/customers/${customer.id}`}
                      className="text-sm font-medium text-neutral-900 hover:text-orange-500 transition-colors"
                    >
                      {customer.full_name}
                    </Link>
                    {customer.address && (
                      <div className="text-xs text-neutral-400 mt-0.5 truncate max-w-[200px] sm:max-w-xs">
                        {customer.address}
                      </div>
                    )}
                    <div className="sm:hidden text-xs text-neutral-500 mt-0.5">
                      {customer.phone || ""}
                    </div>
                  </td>
                  <td className="px-4 sm:px-6 py-3 sm:py-4 text-sm text-neutral-700 hidden sm:table-cell">
                    {customer.phone || "—"}
                  </td>
                  <td className="px-4 sm:px-6 py-3 sm:py-4 text-sm text-neutral-700 hidden md:table-cell">
                    {customer.email || "—"}
                  </td>
                  <td className="px-4 sm:px-6 py-3 sm:py-4 text-right">
                    <Link
                      href={`/customers/${customer.id}`}
                      className={`text-sm font-semibold ${
                        customer.pending_amount > 0
                          ? "text-red-500 hover:text-red-600"
                          : "text-green-600"
                      }`}
                    >
                      {customer.pending_amount > 0
                        ? formatCurrency(customer.pending_amount)
                        : "Settled"}
                    </Link>
                  </td>
                  <td className="px-4 sm:px-6 py-3 sm:py-4">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => setEditCustomer(customer)}
                        className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                        title="Edit"
                      >
                        <Pencil className="w-4 h-4 text-neutral-500" />
                      </button>
                      <button
                        onClick={() => handleDelete(customer.id)}
                        className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Add Customer"
      >
        <CustomerForm
          onSubmit={createCustomer}
          onSuccess={() => {
            setShowCreate(false);
            loadCustomers();
          }}
        />
      </Modal>

      {/* Edit Modal */}
      <Modal
        open={!!editCustomer}
        onClose={() => setEditCustomer(null)}
        title="Edit Customer"
      >
        {editCustomer && (
          <CustomerForm
            customer={editCustomer}
            onSubmit={(formData) => updateCustomer(editCustomer.id, formData)}
            onSuccess={() => {
              setEditCustomer(null);
              loadCustomers();
            }}
          />
        )}
      </Modal>
    </div>
  );
}
