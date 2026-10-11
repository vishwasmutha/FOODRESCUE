"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  BarChart3,
  Bell,
  BrainCircuit,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Gauge,
  HandHeart,
  History,
  Leaf,
  LogOut,
  PlusCircle,
  Settings,
  ShieldCheck,
  Sparkles,
  UserRound,
  Users,
  X,
} from "lucide-react";
import type { SessionUser } from "@/lib/auth";

type NavItem = { href: string; label: string; icon: typeof Gauge };

const businessNav: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: Gauge },
  { href: "/forecast", label: "Surplus forecast", icon: BrainCircuit },
  { href: "/donations/new", label: "Create donation", icon: PlusCircle },
  { href: "/history", label: "Donation history", icon: History },
  { href: "/analytics", label: "Impact analytics", icon: BarChart3 },
];
const ngoNav: NavItem[] = [
  { href: "/dashboard", label: "Nearby donations", icon: HandHeart },
  { href: "/requirements", label: "Requirements", icon: ClipboardList },
  { href: "/history", label: "Donation history", icon: History },
  { href: "/analytics", label: "Impact analytics", icon: BarChart3 },
];
const adminNav: NavItem[] = [
  { href: "/dashboard", label: "Platform overview", icon: Gauge },
  { href: "/admin", label: "Verification & audit", icon: ShieldCheck },
  { href: "/analytics", label: "Platform analytics", icon: BarChart3 },
  { href: "/history", label: "All donations", icon: Users },
];

function initials(name: string) {
  return name.split(" ").filter(Boolean).map((part) => part[0]).slice(0, 2).join("").toUpperCase();
}

export function AppShell({ user, children }: { user: SessionUser; children: ReactNode }) {
  const pathname = usePathname();
  const profileRef = useRef<HTMLDivElement>(null);
  const [unread, setUnread] = useState(0);
  const [profileOpen, setProfileOpen] = useState(false);
  const nav = user.role === "BUSINESS" ? businessNav : user.role === "NGO" ? ngoNav : adminNav;
  const quickAction = user.role === "BUSINESS"
    ? { href: "/donations/new", label: "New donation", icon: PlusCircle }
    : user.role === "NGO"
      ? { href: "/requirements", label: "Update capacity", icon: ClipboardList }
      : { href: "/admin", label: "Review accounts", icon: ShieldCheck };

  useEffect(() => {
    let active = true;
    async function poll() {
      try {
        const response = await fetch("/api/notifications", { cache: "no-store" });
        if (response.ok) {
          const data = await response.json();
          if (active) setUnread(data.unread);
        }
      } catch {
        // Polling is a non-blocking enhancement.
      }
    }
    poll();
    const timer = setInterval(poll, 15_000);
    return () => { active = false; clearInterval(timer); };
  }, []);

  useEffect(() => setProfileOpen(false), [pathname]);

  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) setProfileOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setProfileOpen(false);
    }
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
    window.location.replace("/login");
  }

  return <div className="app-dark min-h-screen bg-[#070e0b]">
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[264px] flex-col border-r border-[#20352c] bg-[#09130f] md:flex">
      <div className="flex h-20 items-center px-6">
        <Link href="/dashboard" title="FoodRescue AI overview" className="flex items-center gap-2.5 text-white">
          <span className="grid size-10 place-items-center rounded-xl border border-[#2c6e51] bg-[#123c2b] text-[#5ee2a2]"><Leaf size={19}/></span>
          <span className="font-extrabold tracking-[-.03em]">FoodRescue <span className="text-[#51da98]">AI</span></span>
        </Link>
      </div>

      <div className="mx-4 mb-5 rounded-xl border border-[#5b4720] bg-[#251d0d] px-3 py-2.5">
        <div className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-wider text-[#f0c66d]"><Sparkles size={13}/> Synthetic demo</div>
        <p className="mt-1 text-[10px] leading-4 text-[#bda46f]">Safe workspace for testing every role</p>
      </div>

      <div className="px-5 pb-2 text-[9px] font-black uppercase tracking-[.16em] text-[#60756b]">Workspace</div>
      <nav className="flex-1 space-y-1 px-3" aria-label={`${user.role.toLowerCase()} workspace`}>
        {nav.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
          return <Link
            key={href}
            href={href}
            title={label}
            aria-current={active ? "page" : undefined}
            className={`group flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition ${active ? "border border-[#2c6d51] bg-[#123b2b] text-[#ecfff5] shadow-[0_8px_28px_rgba(0,0,0,.2)]" : "border border-transparent text-[#91a69c] hover:border-[#20372d] hover:bg-[#0f211a] hover:text-[#dff4e9]"}`}
          >
            <Icon size={18} className={active ? "text-[#54df9d]" : "text-[#6f877b] group-hover:text-[#4bd794]"}/>{label}
          </Link>;
        })}
      </nav>

      <div className="border-t border-[#1e3129] p-3">
        <Link href="/settings" title="Profile and settings" className={`mb-1 flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold ${pathname === "/settings" ? "bg-[#123b2b] text-[#e9fff3]" : "text-[#8ea298] hover:bg-[#0f211a] hover:text-white"}`}><Settings size={18}/>Profile & settings</Link>
        <button onClick={logout} title="Sign out of this session" className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-sm font-semibold text-[#d68b81] hover:bg-[#2a1513] hover:text-[#ff9b8f]"><LogOut size={18}/>Sign out</button>
      </div>
    </aside>

    <div className="md:pl-[264px]">
      <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-[#20342c] bg-[#08120e]/95 px-4 backdrop-blur-xl md:h-20 md:px-8">
        <div className="flex items-center gap-3 md:hidden">
          <Link href="/dashboard" title="Overview" className="grid size-9 place-items-center rounded-xl border border-[#2c6e51] bg-[#123c2b] text-[#5ee2a2]"><Leaf size={18}/></Link>
          <div><span className="block text-sm font-extrabold">FoodRescue AI</span><span className="block text-[9px] font-bold uppercase tracking-wider text-[#72877d]">{user.role} workspace</span></div>
        </div>

        <div className="hidden md:block">
          <p className="text-[10px] font-black uppercase tracking-[.16em] text-[#61756b]">Current workspace</p>
          <p className="mt-1 text-sm font-bold text-[#dbeae3]">{user.role === "BUSINESS" ? "Donor operations" : user.role === "NGO" ? "Recipient operations" : "Platform administration"} <span className="ml-2 font-normal text-[#71857b]">· Asia/Kolkata</span></p>
        </div>

        <div className="flex items-center gap-2">
          <Link href={quickAction.href} title={quickAction.label} className="btn-primary hidden !px-3.5 !py-2.5 lg:inline-flex"><quickAction.icon size={15}/>{quickAction.label}</Link>
          <Link href="/notifications" title="Open notifications" aria-label={`${unread} unread notifications`} className="relative grid size-10 place-items-center rounded-xl border border-[#294238] bg-[#0d1c17] text-[#a8bbb2] hover:border-[#3c6d58] hover:text-white">
            <Bell size={18}/>{unread > 0 && <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-[#dd735d] px-1 text-[10px] font-bold leading-5 text-white">{unread}</span>}
          </Link>

          <div ref={profileRef} className="relative">
            <button
              type="button"
              onClick={() => setProfileOpen((open) => !open)}
              aria-expanded={profileOpen}
              aria-haspopup="menu"
              title="Open account menu"
              className={`flex items-center gap-3 rounded-xl border px-2 py-1.5 text-left transition sm:pr-3 ${profileOpen ? "border-[#3c795e] bg-[#12281f]" : "border-[#294238] bg-[#0d1c17] hover:border-[#3b6352]"}`}
            >
              <span className="grid size-8 place-items-center rounded-lg bg-[#173d2d] text-xs font-black text-[#63dfa5]">{initials(user.name)}</span>
              <div className="hidden sm:block"><p className="max-w-32 truncate text-xs font-bold leading-4 text-[#e9f5ef]">{user.name}</p><p className="text-[9px] font-extrabold uppercase tracking-wider text-[#71877c]">{user.role}</p></div>
              <ChevronDown size={14} className={`hidden text-[#7f948a] transition sm:block ${profileOpen ? "rotate-180" : ""}`}/>
            </button>

            {profileOpen && <div role="menu" className="dark-popover absolute right-0 mt-2 w-72 overflow-hidden rounded-2xl">
              <div className="border-b border-[#243b31] p-4">
                <div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-xl bg-[#173d2d] text-sm font-black text-[#63dfa5]">{initials(user.name)}</span><div className="min-w-0"><p className="truncate text-sm font-extrabold text-white">{user.name}</p><p className="truncate text-[11px] text-[#8fa49a]">{user.email}</p></div></div>
                <div className="mt-3 flex items-center gap-2 rounded-lg bg-[#0a1712] px-3 py-2 text-[10px] font-bold text-[#8ea39a]"><CheckCircle2 size={13} className="text-[#53d797]"/>Active {user.role.toLowerCase()} session</div>
              </div>
              <div className="p-2">
                <Link role="menuitem" href="/settings" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-[#bfd0c8] hover:bg-[#173026] hover:text-white"><UserRound size={17} className="text-[#63a989]"/><span className="flex-1">Profile & settings</span></Link>
                <Link role="menuitem" href="/notifications" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-[#bfd0c8] hover:bg-[#173026] hover:text-white"><Bell size={17} className="text-[#63a989]"/><span className="flex-1">Notifications</span>{unread > 0 && <span className="rounded-full bg-[#71362d] px-2 py-0.5 text-[10px] text-[#ffb1a5]">{unread}</span>}</Link>
                <Link role="menuitem" href={quickAction.href} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-[#bfd0c8] hover:bg-[#173026] hover:text-white"><quickAction.icon size={17} className="text-[#63a989]"/><span className="flex-1">{quickAction.label}</span></Link>
              </div>
              <div className="border-t border-[#243b31] p-2"><button role="menuitem" onClick={logout} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-[#e38d82] hover:bg-[#2b1714]"><LogOut size={17}/>Sign out</button></div>
            </div>}
          </div>
        </div>
      </header>

      <div className="border-b border-[#55431e] bg-[#211a0d] px-4 py-2 text-center text-[10px] font-semibold text-[#d7b66e] md:hidden">Synthetic demo data · no live safety assessment</div>
      <main className="mx-auto max-w-[1440px] p-4 pb-24 sm:p-6 md:p-8">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-30 flex h-[68px] items-center justify-around border-t border-[#263d33] bg-[#09130f]/98 px-1 backdrop-blur-xl md:hidden" aria-label="Mobile workspace">
        {nav.slice(0, 5).map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
          return <Link key={href} href={href} title={label} aria-current={active ? "page" : undefined} className={`flex min-w-14 flex-col items-center gap-1 rounded-lg px-1 py-1.5 text-[9px] font-bold ${active ? "bg-[#123b2b] text-[#63dfa5]" : "text-[#71877c]"}`}><Icon size={19}/><span className="max-w-14 truncate">{label.split(" ")[0]}</span></Link>;
        })}
        <button type="button" title="Open account menu" onClick={() => setProfileOpen(true)} className="flex min-w-14 flex-col items-center gap-1 rounded-lg px-1 py-1.5 text-[9px] font-bold text-[#71877c]"><span className="grid size-5 place-items-center rounded bg-[#173d2d] text-[8px] text-[#63dfa5]">{initials(user.name)}</span><span>Profile</span></button>
      </nav>

      {profileOpen && <button type="button" aria-label="Close account menu" onClick={() => setProfileOpen(false)} className="fixed inset-0 z-10 hidden bg-black/20 md:block"><X className="sr-only"/></button>}
    </div>
  </div>;
}
