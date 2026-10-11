"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { ArrowRight, Building2, HeartHandshake, Leaf, LoaderCircle, LockKeyhole } from "lucide-react";

const demos = [
  { key: "business", label: "Business", email: "donor@foodrescue.demo", icon: Building2 },
  { key: "ngo", label: "NGO", email: "ngo@foodrescue.demo", icon: HeartHandshake },
  { key: "admin", label: "Admin", email: "admin@foodrescue.demo", icon: LockKeyhole },
] as const;

export default function LoginPage() {
  const [email, setEmail] = useState("donor@foodrescue.demo");
  const [password, setPassword] = useState("Demo@123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState<string | null>(null);

  useEffect(() => {
    const requestedRole = new URLSearchParams(window.location.search).get("demo")?.toLowerCase();
    const selected = demos.find((demo) => demo.key === requestedRole);
    if (selected) {
      setEmail(selected.email);
      setPassword("Demo@123");
    }
  }, []);

  async function signIn(loginEmail: string, loginPassword: string, loadingKey: string) {
    setLoading(loadingKey);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail.trim(), password: loginPassword }),
      });
      const result = await response.json().catch(() => ({ error: "The server returned an invalid response" }));
      if (!response.ok) throw new Error(result.error ?? "Unable to sign in");

      // A full navigation guarantees the newly issued HTTP-only session cookie is
      // present when the protected server layout evaluates authentication.
      window.location.replace("/dashboard");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to sign in");
      setLoading(null);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    await signIn(email, password, "manual");
  }

  async function openDemo(demo: (typeof demos)[number]) {
    setEmail(demo.email);
    setPassword("Demo@123");
    await signIn(demo.email, "Demo@123", demo.key);
  }

  return <main className="app-dark grid min-h-screen bg-[var(--cream)] lg:grid-cols-[.9fr_1.1fr]">
    <section className="flex flex-col px-6 py-6 sm:px-10 lg:px-14">
      <Link href="/" className="flex items-center gap-2 text-[var(--forest-950)]">
        <span className="grid size-9 place-items-center rounded-xl bg-[var(--forest-900)] text-white"><Leaf size={18}/></span>
        <span className="font-extrabold">FoodRescue <span className="text-[var(--forest-600)]">AI</span></span>
      </Link>
      <div className="my-auto w-full max-w-md self-center py-14">
        <p className="eyebrow">Welcome back</p>
        <h1 className="mt-3 text-4xl font-black tracking-[-.04em] text-[var(--forest-950)]">Sign in to coordinate rescue.</h1>
        <p className="mt-3 text-sm leading-6 text-[#65726c]">Choose a role for one-click demo access, or use your registered account.</p>

        <div className="mt-7 grid grid-cols-3 gap-2" aria-label="Demo account access">
          {demos.map((demo) => {
            const Icon = demo.icon;
            const isLoading = loading === demo.key;
            return <button
              type="button"
              key={demo.key}
              disabled={loading !== null}
              onClick={() => openDemo(demo)}
              className={`rounded-xl border p-3 text-left transition disabled:cursor-wait disabled:opacity-70 ${email === demo.email ? "border-[var(--forest-600)] bg-[var(--mint-50)]" : "border-[#dbe1dd] bg-white hover:border-[#adc6b7]"}`}
              aria-label={`Sign in as demo ${demo.label}`}
            >
              {isLoading ? <LoaderCircle size={17} className="animate-spin text-[var(--forest-700)]"/> : <Icon size={17} className="text-[var(--forest-700)]"/>}
              <span className="mt-2 block text-xs font-bold">{isLoading ? "Opening…" : demo.label}</span>
              <span className="mt-0.5 block text-[9px] font-semibold text-[#7d8883]">One-click access</span>
            </button>;
          })}
        </div>

        <div className="my-6 flex items-center gap-3 text-[10px] font-bold uppercase tracking-wider text-[#98a19d]"><span className="h-px flex-1 bg-[#dfe4e1]"/>or sign in manually<span className="h-px flex-1 bg-[#dfe4e1]"/></div>

        <form onSubmit={submit} className="space-y-4">
          <div><label className="label" htmlFor="email">Email address</label><input id="email" className="input" type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)}/></div>
          <div><div className="flex items-center justify-between"><label className="label" htmlFor="password">Password</label><span className="mb-2 text-[11px] text-[#8b9691]">Demo: Demo@123</span></div><input id="password" className="input" type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)}/></div>
          {error && <div role="alert" className="rounded-lg border border-[#f1c5be] bg-[#fff1ef] px-3 py-2 text-sm text-[#9f2d22]">{error}</div>}
          <button disabled={loading !== null} className="btn-primary w-full py-3" type="submit">{loading === "manual" ? <><LoaderCircle size={16} className="animate-spin"/>Signing in…</> : <>Sign in<ArrowRight size={16}/></>}</button>
        </form>
        <p className="mt-6 text-center text-sm text-[#69756f]">New to FoodRescue AI? <Link href="/signup" className="font-bold text-[var(--forest-700)]">Create an account</Link></p>
      </div>
      <p className="text-xs text-[#8b9590]">Synthetic demo · No real NGO partnerships or food safety assessments</p>
    </section>
    <section className="relative hidden overflow-hidden bg-[var(--forest-950)] p-14 text-white lg:block">
      <div className="grid-paper absolute inset-0 opacity-20"/>
      <div className="relative flex h-full flex-col justify-between">
        <span className="demo-stripe w-fit rounded-full px-3 py-1.5 text-xs font-bold">Demo workspace</span>
        <div><p className="text-5xl font-black leading-[1.02] tracking-[-.05em]">One handover.<br/>A complete trail.</p><div className="mt-10 max-w-lg rounded-2xl border border-white/10 bg-white/[.06] p-6"><div className="flex justify-between text-xs text-[#9fb5ac]"><span>FR-2408-DEMO</span><span>TIME-SENSITIVE</span></div><div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full w-3/5 rounded-full bg-[#72c296]"/></div><div className="mt-4 grid grid-cols-4 text-[10px] font-semibold text-[#9eb1aa]"><span className="text-white">Available</span><span className="text-white">Offered</span><span>Accepted</span><span>Completed</span></div></div></div>
        <p className="max-w-md text-sm leading-6 text-[#93aaa1]">Every reservation, capacity change, pickup, and receipt is validated server-side and written to the audit trail.</p>
      </div>
    </section>
  </main>;
}
