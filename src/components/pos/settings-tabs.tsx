"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Plus, Pencil, Trash2, Loader2, Warehouse, Store } from "lucide-react";
import { saveLocation, saveCategory, deleteCategory, saveDiscounts } from "@/lib/actions/catalog";
import { setStaff } from "@/lib/actions/staff";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import { errorBoxClass, inputClass, labelClass, primaryButtonClass } from "@/components/pos/form-styles";
import type { Category, CategoryDiscount, Location, Role, StaffMember } from "@/lib/pos/types";

const tabs = [
  { key: "locations", label: "Exhibitions & warehouses" },
  { key: "categories", label: "Categories" },
  { key: "discounts", label: "Discounts" },
  { key: "staff", label: "Staff" },
] as const;

type Tab = (typeof tabs)[number]["key"];

export function SettingsTabs({
  locations,
  categories,
  discounts,
  staff,
}: {
  locations: Location[];
  categories: Category[];
  discounts: CategoryDiscount[];
  staff: StaffMember[];
}) {
  const [tab, setTab] = useState<Tab>("locations");

  return (
    <div className="space-y-4">
      <div className="flex gap-1 p-1 glass-card rounded-xl w-fit max-w-full overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              tab === t.key ? "bg-white shadow-sm text-neutral-900" : "text-neutral-500 hover:text-neutral-900"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "locations" && <LocationsTab locations={locations} />}
      {tab === "categories" && <CategoriesTab categories={categories} />}
      {tab === "discounts" && <DiscountsTab locations={locations} categories={categories} discounts={discounts} />}
      {tab === "staff" && <StaffTab staff={staff} locations={locations} />}
    </div>
  );
}

// ================= Locations =================

function LocationsTab({ locations }: { locations: Location[] }) {
  const [editing, setEditing] = useState<Location | "new" | null>(null);

  return (
    <div className="glass-card rounded-xl">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <p className="text-sm text-neutral-500">The code is printed at the start of every bill number, e.g. BO102627-0001.</p>
        <button type="button" onClick={() => setEditing("new")} className={primaryButtonClass}>
          <Plus className="w-4 h-4" />
          Add
        </button>
      </div>
      {locations.length === 0 ? (
        <p className="text-sm text-neutral-500 text-center py-10">Add your warehouse and your first exhibition.</p>
      ) : (
        <div className="divide-y divide-gray-100">
          {locations.map((l) => (
            <div key={l.id} className="flex items-center gap-4 px-6 py-3">
              <div className="w-9 h-9 rounded-lg bg-orange-500/10 flex items-center justify-center flex-shrink-0">
                {l.kind === "WAREHOUSE" ? (
                  <Warehouse className="w-4 h-4 text-orange-500" />
                ) : (
                  <Store className="w-4 h-4 text-orange-500" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-neutral-900">
                  {l.name} <span className="text-neutral-400 font-normal">· {l.code}</span>
                </p>
                <p className="text-xs text-neutral-400 truncate">
                  {l.kind === "WAREHOUSE" ? "Warehouse" : "Exhibition"}
                  {l.start_date && ` · ${format(new Date(l.start_date), "dd MMM yyyy")}`}
                  {l.end_date && ` – ${format(new Date(l.end_date), "dd MMM yyyy")}`}
                  {l.address && ` · ${l.address}`}
                </p>
              </div>
              {l.is_active ? <Badge variant="success">Active</Badge> : <Badge variant="default">Closed</Badge>}
              <button
                type="button"
                onClick={() => setEditing(l)}
                className="p-2 rounded-lg text-neutral-400 hover:text-neutral-900 hover:bg-white"
              >
                <Pencil className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "Add exhibition or warehouse" : "Edit"}
      >
        {editing && (
          <LocationForm location={editing === "new" ? null : editing} onDone={() => setEditing(null)} />
        )}
      </Modal>
    </div>
  );
}

function LocationForm({ location, onDone }: { location: Location | null; onDone: () => void }) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: location?.name ?? "",
    kind: location?.kind ?? "EXHIBITION",
    code: location?.code ?? "",
    address: location?.address ?? "",
    start_date: location?.start_date ?? "",
    end_date: location?.end_date ?? "",
    is_active: location?.is_active ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const result = await saveLocation(location?.id ?? null, form);
    setSaving(false);
    if (result.error) return setError(result.error);
    toast.success("Saved");
    router.refresh();
    onDone();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <div className={errorBoxClass}>{error}</div>}
      <div className="grid grid-cols-2 gap-2">
        {(["EXHIBITION", "WAREHOUSE"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setForm({ ...form, kind: k })}
            className={`py-2 rounded-lg border text-sm font-medium ${
              form.kind === k ? "border-orange-500 bg-orange-50 text-orange-700" : "border-gray-200 text-neutral-600"
            }`}
          >
            {k === "EXHIBITION" ? "Exhibition" : "Warehouse"}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <label className={labelClass}>Name</label>
          <input
            autoFocus
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Borivali Book Fair"
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Code</label>
          <input
            required
            value={form.code}
            maxLength={4}
            onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase().replace(/[^A-Z]/g, "") })}
            placeholder="BO"
            className={`${inputClass} uppercase tracking-wider`}
          />
        </div>
      </div>
      <div>
        <label className={labelClass}>Address (printed on bills)</label>
        <textarea
          rows={2}
          value={form.address}
          onChange={(e) => setForm({ ...form, address: e.target.value })}
          className={inputClass}
        />
      </div>
      {form.kind === "EXHIBITION" && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Start date</label>
            <input
              type="date"
              value={form.start_date}
              onChange={(e) => setForm({ ...form, start_date: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>End date</label>
            <input
              type="date"
              value={form.end_date}
              onChange={(e) => setForm({ ...form, end_date: e.target.value })}
              className={inputClass}
            />
          </div>
        </div>
      )}
      <label className="flex items-center gap-2 text-sm text-neutral-700">
        <input
          type="checkbox"
          checked={form.is_active}
          onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
          className="rounded accent-orange-500"
        />
        Active (closed locations are hidden from billing)
      </label>
      <button type="submit" disabled={saving} className={`${primaryButtonClass} w-full`}>
        {saving && <Loader2 className="w-4 h-4 animate-spin" />}
        Save
      </button>
    </form>
  );
}

// ================= Categories =================

function CategoriesTab({ categories }: { categories: Category[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Category | "new" | null>(null);

  async function remove(c: Category) {
    const result = await deleteCategory(c.id);
    if (result.error) toast.error(result.error);
    else {
      toast.success("Deleted");
      router.refresh();
    }
  }

  return (
    <div className="glass-card rounded-xl">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <p className="text-sm text-neutral-500">For example: Lot ₹100, Children, Fiction, Kg books.</p>
        <button type="button" onClick={() => setEditing("new")} className={primaryButtonClass}>
          <Plus className="w-4 h-4" />
          Add
        </button>
      </div>
      {categories.length === 0 ? (
        <p className="text-sm text-neutral-500 text-center py-10">No categories yet.</p>
      ) : (
        <div className="divide-y divide-gray-100">
          {categories.map((c) => (
            <div key={c.id} className="flex items-center gap-4 px-6 py-3">
              <p className="flex-1 text-sm font-medium text-neutral-900">{c.name}</p>
              <Badge variant={c.sell_by === "KG" ? "info" : "default"}>{c.sell_by === "KG" ? "By kg" : "Per piece"}</Badge>
              <button
                type="button"
                onClick={() => setEditing(c)}
                className="p-2 rounded-lg text-neutral-400 hover:text-neutral-900 hover:bg-white"
              >
                <Pencil className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => remove(c)}
                className="p-2 rounded-lg text-neutral-400 hover:text-red-500 hover:bg-red-50"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === "new" ? "Add category" : "Edit category"}>
        {editing && <CategoryForm category={editing === "new" ? null : editing} onDone={() => setEditing(null)} />}
      </Modal>
    </div>
  );
}

function CategoryForm({ category, onDone }: { category: Category | null; onDone: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(category?.name ?? "");
  const [sellBy, setSellBy] = useState(category?.sell_by ?? "PIECE");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const result = await saveCategory(category?.id ?? null, { name, sell_by: sellBy });
    setSaving(false);
    if (result.error) return setError(result.error);
    toast.success("Saved");
    router.refresh();
    onDone();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <div className={errorBoxClass}>{error}</div>}
      <div>
        <label className={labelClass}>Name</label>
        <input autoFocus required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>Sold</label>
        <div className="grid grid-cols-2 gap-2">
          {(["PIECE", "KG"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSellBy(s)}
              className={`py-2 rounded-lg border text-sm font-medium ${
                sellBy === s ? "border-orange-500 bg-orange-50 text-orange-700" : "border-gray-200 text-neutral-600"
              }`}
            >
              {s === "PIECE" ? "Per piece" : "By weight (kg)"}
            </button>
          ))}
        </div>
      </div>
      <button type="submit" disabled={saving} className={`${primaryButtonClass} w-full`}>
        {saving && <Loader2 className="w-4 h-4 animate-spin" />}
        Save
      </button>
    </form>
  );
}

// ================= Discounts =================

function DiscountsTab({
  locations,
  categories,
  discounts,
}: {
  locations: Location[];
  categories: Category[];
  discounts: CategoryDiscount[];
}) {
  const router = useRouter();
  const [locationId, setLocationId] = useState(locations.find((l) => l.is_active)?.id ?? locations[0]?.id ?? "");
  const initial = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of categories) {
      const d = discounts.find((x) => x.location_id === locationId && x.category_id === c.id);
      map[c.id] = d ? String(Number(d.discount)) : "0";
    }
    return map;
  }, [categories, discounts, locationId]);
  const [values, setValues] = useState(initial);
  const [saving, setSaving] = useState(false);

  // Reset the form when switching location
  const [shownFor, setShownFor] = useState(locationId);
  if (shownFor !== locationId) {
    setShownFor(locationId);
    setValues(initial);
  }

  async function save() {
    setSaving(true);
    const result = await saveDiscounts(
      locationId,
      categories.map((c) => ({ category_id: c.id, discount: parseFloat(values[c.id]) || 0 }))
    );
    setSaving(false);
    if (result.error) toast.error(result.error);
    else {
      toast.success("Discounts saved");
      router.refresh();
    }
  }

  if (locations.length === 0 || categories.length === 0) {
    return (
      <div className="glass-card rounded-xl p-10 text-center text-sm text-neutral-500">
        Add locations and categories first.
      </div>
    );
  }

  return (
    <div className="glass-card rounded-xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-6 py-4 border-b border-gray-100">
        <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className={`${inputClass} sm:w-72`}>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <button type="button" onClick={save} disabled={saving} className={primaryButtonClass}>
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          Save discounts
        </button>
      </div>
      <div className="divide-y divide-gray-100">
        {categories.map((c) => (
          <div key={c.id} className="flex items-center gap-4 px-6 py-3">
            <p className="flex-1 text-sm font-medium text-neutral-900">{c.name}</p>
            <div className="relative w-28">
              <input
                value={values[c.id] ?? "0"}
                inputMode="decimal"
                onChange={(e) => setValues({ ...values, [c.id]: e.target.value.replace(/[^\d.]/g, "") })}
                className={`${inputClass} pr-7 text-right`}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-neutral-400">%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ================= Staff =================

function StaffTab({ staff, locations }: { staff: StaffMember[]; locations: Location[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function update(member: StaffMember, role: Role, locationId: string | null) {
    if (role === "STAFF" && !locationId) {
      locationId = locations.find((l) => l.is_active && l.kind === "EXHIBITION")?.id ?? null;
      if (!locationId) return toast.error("Add an exhibition first");
    }
    setBusy(member.id);
    const result = await setStaff(member.id, role, locationId);
    setBusy(null);
    if (result.error) toast.error(result.error);
    else {
      toast.success("Updated");
      router.refresh();
    }
  }

  return (
    <div className="glass-card rounded-xl">
      <div className="px-6 py-4 border-b border-gray-100">
        <p className="text-sm text-neutral-500">
          New people sign up on the login page, then you approve them here. Staff can only bill at their exhibition.
        </p>
      </div>
      <div className="divide-y divide-gray-100">
        {staff.map((m) => (
          <div key={m.id} className="flex flex-col sm:flex-row sm:items-center gap-3 px-6 py-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-neutral-900 truncate">{m.full_name || m.email}</p>
              <p className="text-xs text-neutral-400 truncate">{m.email}</p>
            </div>
            {busy === m.id && <Loader2 className="w-4 h-4 animate-spin text-neutral-400" />}
            <select
              value={m.role}
              onChange={(e) => update(m, e.target.value as Role, m.location_id)}
              className={`${inputClass} sm:w-36`}
            >
              <option value="PENDING">Not approved</option>
              <option value="STAFF">Staff</option>
              <option value="ADMIN">Admin</option>
            </select>
            {m.role === "STAFF" && (
              <select
                value={m.location_id ?? ""}
                onChange={(e) => update(m, "STAFF", e.target.value)}
                className={`${inputClass} sm:w-56`}
              >
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
