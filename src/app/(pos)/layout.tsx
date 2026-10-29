import { Navbar } from "@/components/navbar";
import { Toaster } from "@/components/ui/toast";
import { getCurrentStaff } from "@/lib/pos/session";

// Full-width layout for the billing screen
export default async function PosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const staff = await getCurrentStaff();

  return (
    <div className="min-h-screen bg-gradient-main">
      <Navbar role={staff?.role ?? "PENDING"} fullWidth />
      <main className="px-3 sm:px-4 py-3">{children}</main>
      <Toaster />
    </div>
  );
}
