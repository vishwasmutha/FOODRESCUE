const styles: Record<string, string> = {
  AVAILABLE: "border border-[#276348] bg-[#123a2a] text-[#70e3aa]",
  OFFERED: "border border-[#315a78] bg-[#142c3d] text-[#8bc5ef]",
  ACCEPTED: "border border-[#475a94] bg-[#222d56] text-[#aab9ff]",
  PICKUP_IN_PROGRESS: "border border-[#765820] bg-[#32250d] text-[#f0c66d]",
  COMPLETED: "border border-[#2d704f] bg-[#143d2c] text-[#7be2ac]",
  PARTIALLY_COMPLETED: "border border-[#62682c] bg-[#2c3014] text-[#d2db77]",
  EXPIRED: "border border-[#454f4a] bg-[#222b27] text-[#a8b3ad]",
  CANCELLED: "border border-[#713b34] bg-[#321a17] text-[#f1a096]",
  DRAFT: "border border-[#46534d] bg-[#202b26] text-[#b5c3bc]",
  URGENT: "border border-[#8b4037] bg-[#3a1916] text-[#ff9c90]",
  TIME_SENSITIVE: "border border-[#765820] bg-[#32250d] text-[#f0c66d]",
  NORMAL: "border border-[#276348] bg-[#123a2a] text-[#70e3aa]",
  MANUAL_REVIEW: "border border-[#704d80] bg-[#30203a] text-[#d9a9ed]",
  VERIFIED: "border border-[#276348] bg-[#123a2a] text-[#70e3aa]",
  PENDING: "border border-[#765820] bg-[#32250d] text-[#f0c66d]",
  SUSPENDED: "border border-[#8b4037] bg-[#3a1916] text-[#ff9c90]",
  ACTIVE: "border border-[#276348] bg-[#123a2a] text-[#70e3aa]",
  FULFILLED: "border border-[#2d704f] bg-[#143d2c] text-[#7be2ac]",
  RELEASED: "border border-[#454f4a] bg-[#222b27] text-[#a8b3ad]",
};

export function StatusPill({ value }: { value: string }) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide ${styles[value] ?? "border border-[#46534d] bg-[#202b26] text-[#b5c3bc]"}`}>{value.replaceAll("_", " ")}</span>;
}
