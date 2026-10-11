import { desc, eq } from "drizzle-orm";
import { CheckCircle2, ClipboardList, Scale } from "lucide-react";
import { db } from "@/db";
import { businesses, donations, ngos, reservations } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { HistoryExplorer, type HistoryRow } from "@/components/history-explorer";

export default async function HistoryPage() {
  const user = await getSessionUser();
  if (!user) return null;

  let rows: Array<typeof donations.$inferSelect> = [];
  if (user.role === "BUSINESS") {
    const [business] = await db.select().from(businesses).where(eq(businesses.ownerId, user.id)).limit(1);
    if (business) rows = await db.select().from(donations).where(eq(donations.businessId, business.id)).orderBy(desc(donations.createdAt));
  } else if (user.role === "NGO") {
    const [ngo] = await db.select().from(ngos).where(eq(ngos.ownerId, user.id)).limit(1);
    if (ngo) {
      const related = await db.select({ donation: donations }).from(reservations).innerJoin(donations, eq(donations.id, reservations.donationId)).where(eq(reservations.ngoId, ngo.id)).orderBy(desc(donations.createdAt));
      rows = related.map((item) => item.donation);
    }
  } else {
    rows = await db.select().from(donations).orderBy(desc(donations.createdAt));
  }

  const offered = rows.reduce((sum, row) => sum + row.totalQuantityKg, 0);
  const rescued = rows.reduce((sum, row) => sum + row.completedQuantityKg, 0);
  const completed = rows.filter((row) => row.status === "COMPLETED" || row.status === "PARTIALLY_COMPLETED").length;
  const serialized: HistoryRow[] = rows.map((row) => ({
    id: row.id,
    publicId: row.publicId,
    title: row.title,
    status: row.status,
    urgency: row.urgency,
    totalQuantityKg: row.totalQuantityKg,
    reservedQuantityKg: row.reservedQuantityKg,
    completedQuantityKg: row.completedQuantityKg,
    createdAt: row.createdAt.toISOString(),
    pickupDeadline: row.pickupDeadline.toISOString(),
  }));

  return <div>
    <div>
      <p className="eyebrow">Donation records</p>
      <h1 className="mt-2 text-3xl font-black tracking-[-.04em] text-[var(--forest-950)] sm:text-4xl">Searchable history & outcomes</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-[#68756f]">Search, filter, sort, and export the records visible to your role. Only recipient-confirmed handovers count as rescued.</p>
    </div>

    <div className="mt-6 grid gap-4 sm:grid-cols-3">
      <Metric icon={ClipboardList} label="Donation records" value={String(rows.length)} detail={`${completed} with completed receipts`}/>
      <Metric icon={Scale} label="Food offered" value={`${offered.toFixed(1)} kg`} detail="Excludes predictions and drafts"/>
      <Metric icon={CheckCircle2} label="Completed handover" value={`${rescued.toFixed(1)} kg`} detail="Recipient-confirmed quantity" accent/>
    </div>

    <HistoryExplorer rows={serialized}/>
    <p className="mt-4 text-[10px] leading-5 text-[#87918c]">Demo history is synthetic. Expired or accepted quantities are not counted as successfully rescued unless a recipient completion was recorded.</p>
  </div>;
}

function Metric({ icon: Icon, label, value, detail, accent = false }: { icon: typeof Scale; label: string; value: string; detail: string; accent?: boolean }) {
  return <div className="card p-5"><div className="flex items-start justify-between"><div><p className="text-xs font-bold text-[#7a8580]">{label}</p><p className={`mt-2 text-3xl font-black ${accent ? "text-[#66e0a6]" : "text-[#edf8f2]"}`}>{value}</p><p className="mt-2 text-[10px] text-[#6f8379]">{detail}</p></div><span className="grid size-10 place-items-center rounded-xl border border-[#28513f] bg-[#102a20] text-[#54d596]"><Icon size={18}/></span></div></div>;
}
