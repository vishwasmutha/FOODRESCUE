"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, Download, Filter, History as HistoryIcon, Search, X } from "lucide-react";
import { StatusPill } from "@/components/status-pill";

export type HistoryRow = {
  id: string;
  publicId: string;
  title: string;
  status: string;
  urgency: string;
  totalQuantityKg: number;
  reservedQuantityKg: number;
  completedQuantityKg: number;
  createdAt: string;
  pickupDeadline: string;
};

type FilterName = "All" | "Active" | "Completed" | "Needs attention";
type SortName = "newest" | "oldest" | "quantity" | "rescued";

const activeStatuses = new Set(["AVAILABLE", "OFFERED", "ACCEPTED", "PICKUP_IN_PROGRESS"]);
const completedStatuses = new Set(["COMPLETED", "PARTIALLY_COMPLETED"]);
const attentionStatuses = new Set(["EXPIRED", "FAILED_PICKUP", "UNSAFE", "CANCELLED"]);

function escapeCsv(value: string | number) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function HistoryExplorer({ rows }: { rows: HistoryRow[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterName>("All");
  const [sort, setSort] = useState<SortName>("newest");

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const matches = rows.filter((row) => {
      const queryMatch = !normalizedQuery || `${row.title} ${row.publicId} ${row.status}`.toLowerCase().includes(normalizedQuery);
      const statusMatch = filter === "All"
        || (filter === "Active" && activeStatuses.has(row.status))
        || (filter === "Completed" && completedStatuses.has(row.status))
        || (filter === "Needs attention" && attentionStatuses.has(row.status));
      return queryMatch && statusMatch;
    });
    return [...matches].sort((first, second) => {
      if (sort === "oldest") return Date.parse(first.createdAt) - Date.parse(second.createdAt);
      if (sort === "quantity") return second.totalQuantityKg - first.totalQuantityKg;
      if (sort === "rescued") return second.completedQuantityKg - first.completedQuantityKg;
      return Date.parse(second.createdAt) - Date.parse(first.createdAt);
    });
  }, [filter, query, rows, sort]);

  function exportCsv() {
    const header = ["Donation ID", "Title", "Created UTC", "Status", "Offered kg", "Reserved kg", "Received kg", "Pickup deadline UTC"];
    const lines = filtered.map((row) => [row.publicId, row.title, row.createdAt, row.status, row.totalQuantityKg, row.reservedQuantityKg, row.completedQuantityKg, row.pickupDeadline].map(escapeCsv).join(","));
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `foodrescue-history-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  const hasFilters = query.length > 0 || filter !== "All" || sort !== "newest";

  return <section className="card mt-6 overflow-hidden">
    <div className="border-b border-[#263b32] p-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="relative flex-1 xl:max-w-md">
          <Search size={15} className="pointer-events-none absolute left-3 top-3.5 text-[#71877c]"/>
          <input value={query} onChange={(event) => setQuery(event.target.value)} className="input !pl-9 !pr-9" placeholder="Search title, ID, or status" aria-label="Search donation records"/>
          {query && <button type="button" onClick={() => setQuery("")} title="Clear search" className="absolute right-2 top-2.5 grid size-7 place-items-center rounded-lg text-[#71877c] hover:bg-[#193026] hover:text-white"><X size={14}/></button>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex max-w-full gap-1 overflow-x-auto rounded-xl border border-[#283f35] bg-[#0a1511] p-1" aria-label="History status filter">
            {(["All", "Active", "Completed", "Needs attention"] as FilterName[]).map((item) => <button type="button" key={item} onClick={() => setFilter(item)} className={`whitespace-nowrap rounded-lg px-3 py-2 text-[11px] font-extrabold transition ${filter === item ? "bg-[#194a35] text-[#7be2ac]" : "text-[#7f9389] hover:bg-[#11251d] hover:text-white"}`}>{item}</button>)}
          </div>
          <label className="relative"><Filter size={14} className="pointer-events-none absolute left-3 top-3 text-[#71877c]"/><select value={sort} onChange={(event) => setSort(event.target.value as SortName)} className="input !w-auto !pl-9 !pr-8 text-xs font-bold" aria-label="Sort donation records"><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="quantity">Largest offered</option><option value="rescued">Most rescued</option></select></label>
          <button type="button" onClick={exportCsv} disabled={!filtered.length} title="Download the current filtered view as CSV" className="btn-secondary"><Download size={15}/>Export CSV</button>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-[#6f8379]"><span>{filtered.length} of {rows.length} records shown</span>{hasFilters && <button type="button" onClick={() => { setQuery(""); setFilter("All"); setSort("newest"); }} className="text-[#56d99a] hover:text-[#8aefbc]">Reset view</button>}</div>
    </div>

    {filtered.length
      ? <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left"><thead className="text-[10px] uppercase tracking-wider text-[#7e8984]"><tr><th className="px-5 py-3">Donation</th><th className="px-5 py-3">Created</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Offered</th><th className="px-5 py-3">Reserved</th><th className="px-5 py-3">Received</th><th className="px-5 py-3"><span className="sr-only">Open</span></th></tr></thead><tbody className="divide-y divide-[#20352c]">{filtered.map((row) => <tr key={row.id} className="text-sm transition hover:bg-[#11241c]"><td className="px-5 py-4"><p className="font-extrabold text-[#e8f5ef]">{row.title}</p><p className="mt-1 text-[10px] font-bold text-[#70857b]">{row.publicId}</p></td><td className="px-5 py-4 text-xs text-[#8ea299]">{new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(row.createdAt))}</td><td className="px-5 py-4"><StatusPill value={row.status}/></td><td className="px-5 py-4 font-bold text-[#d9e8e1]">{row.totalQuantityKg} kg</td><td className="px-5 py-4 text-[#8ea299]">{row.reservedQuantityKg} kg</td><td className="px-5 py-4 font-extrabold text-[#62dfa3]">{row.completedQuantityKg} kg</td><td className="px-5 py-4"><Link href={`/donations/${row.id}`} title={`Open ${row.title}`} aria-label={`Open ${row.title}`} className="grid size-9 place-items-center rounded-lg border border-[#2a4539] bg-[#0d1c17] text-[#69dca5] hover:border-[#4a8069] hover:bg-[#163024]"><ArrowRight size={14}/></Link></td></tr>)}</tbody></table></div>
      : <div className="grid min-h-72 place-items-center text-center"><div><HistoryIcon className="mx-auto text-[#60756b]"/><p className="mt-3 text-sm font-bold text-[#d7e6df]">No records match this view</p><p className="mt-1 text-xs text-[#71857b]">Try another status or clear the search.</p>{hasFilters && <button type="button" onClick={() => { setQuery(""); setFilter("All"); setSort("newest"); }} className="btn-secondary mt-4">Clear filters</button>}</div></div>}
  </section>;
}
