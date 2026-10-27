import { Navbar } from "@/components/navbar";
import { Toaster } from "@/components/ui/toast";
import { getCurrentStaff } from "@/lib/pos/session";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const staff = await getCurrentStaff();

  return (
    <div className="min-h-screen bg-gradient-main">
      <Navbar role={staff?.role ?? "PENDING"} />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-8">{children}</main>
      <Toaster />
    </div>
  );
}
