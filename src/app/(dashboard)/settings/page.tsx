import { requireRole } from "@/lib/pos/guard";
import { getCategories, getDiscounts, getLocations } from "@/lib/actions/catalog";
import { listStaff } from "@/lib/actions/staff";
import { PageHeader } from "@/components/ui/page-header";
import { SettingsTabs } from "@/components/pos/settings-tabs";

export const metadata = { title: "Settings - Books Plaza" };

export default async function SettingsPage() {
  await requireRole(["ADMIN"]);
  const [locations, categories, discounts, staff] = await Promise.all([
    getLocations(),
    getCategories(),
    getDiscounts(),
    listStaff(),
  ]);

  return (
    <div>
      <PageHeader title="Settings" description="Exhibitions, categories, discounts and staff" />
      <SettingsTabs locations={locations} categories={categories} discounts={discounts} staff={staff} />
    </div>
  );
}
