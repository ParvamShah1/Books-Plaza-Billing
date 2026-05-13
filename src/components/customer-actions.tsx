"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { CustomerForm } from "@/components/customer-form";
import {
  createCustomer,
  updateCustomer,
  deleteCustomer,
} from "@/lib/actions/customers";
import type { Customer } from "@/lib/types";
import { Plus, Pencil, Trash2 } from "lucide-react";

export function CreateCustomerButton() {
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);

  return (
    <>
      <button
        onClick={() => setShowCreate(true)}
        className="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 transition-colors flex items-center gap-2"
      >
        <Plus className="w-4 h-4" />
        Add Customer
      </button>

      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Add Customer"
      >
        <CustomerForm
          onSubmit={createCustomer}
          onSuccess={() => {
            setShowCreate(false);
            router.refresh();
          }}
        />
      </Modal>
    </>
  );
}

export function CustomerRowActions({ customer }: { customer: Customer }) {
  const router = useRouter();
  const [editCustomer, setEditCustomer] = useState(false);

  async function handleDelete() {
    if (!confirm("Are you sure you want to delete this customer?")) return;
    await deleteCustomer(customer.id);
    router.refresh();
  }

  return (
    <>
      <div className="flex items-center justify-end gap-2">
        <button
          onClick={() => setEditCustomer(true)}
          className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          title="Edit"
        >
          <Pencil className="w-4 h-4 text-neutral-500" />
        </button>
        <button
          onClick={handleDelete}
          className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"
          title="Delete"
        >
          <Trash2 className="w-4 h-4 text-red-500" />
        </button>
      </div>

      <Modal
        open={editCustomer}
        onClose={() => setEditCustomer(false)}
        title="Edit Customer"
      >
        <CustomerForm
          customer={customer}
          onSubmit={(formData) => updateCustomer(customer.id, formData)}
          onSuccess={() => {
            setEditCustomer(false);
            router.refresh();
          }}
        />
      </Modal>
    </>
  );
}
