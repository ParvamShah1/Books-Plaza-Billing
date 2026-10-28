import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Receipt, type ReceiptData } from "@/components/pos/receipt";

export const metadata = { title: "Your bill - Books Plaza" };

// Opened from the WhatsApp link, no login needed
export default async function PublicBillPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(token)) notFound();

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_public_bill", { p_token: token });
  if (error || !data) notFound();

  return (
    <div className="min-h-screen bg-gradient-main py-6 px-4">
      <div className="mx-auto max-w-sm bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <Receipt data={data as ReceiptData} />
      </div>
    </div>
  );
}
