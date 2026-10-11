"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Clock3,
  Info,
  LoaderCircle,
  MapPin,
  RefreshCw,
  Save,
  Scale,
  Sparkles,
  Truck,
  WandSparkles,
} from "lucide-react";

type Category = { id: string; name: string };
type Profile = {
  account: { role: string };
  organization: {
    name: string;
    requirementsText: string | null;
    maxCapacityKg: number;
    currentCapacityKg: number;
    maxTravelDistanceKm: number;
    hasTransport: boolean;
    acceptsPartial: boolean;
    verificationStatus: string;
  };
  requirements: {
    acceptedCategories: Array<{ id: string; name: string }>;
    operatingHours: Array<{ opensAt: string; closesAt: string }>;
  } | null;
};
type Extraction = {
  acceptedCategories: { value: string[] };
  capacityKg: { value: number | null };
  pickupWindow: { value: { start: string; end: string } | null };
  dietaryTags: { value: string[] };
  storageRequirements: { value: string[] };
  transportation: { value: boolean | null };
  clarifications: string[];
};

export default function RequirementsPage() {
  const requestId = useRef(0);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [analyzedText, setAnalyzedText] = useState("");
  const [extraction, setExtraction] = useState<Extraction | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [autoAnalyzing, setAutoAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [profileResponse, categoryResponse] = await Promise.all([
        fetch("/api/profile", { cache: "no-store" }),
        fetch("/api/categories", { cache: "no-store" }),
      ]);
      const profileData = await profileResponse.json();
      const categoryData = await categoryResponse.json();
      if (!profileResponse.ok) throw new Error(profileData.error);
      setProfile(profileData);
      setText(profileData.organization?.requirementsText ?? "");
      setSelected(profileData.requirements?.acceptedCategories.map((item: { id: string }) => item.id) ?? []);
      setCategories(categoryData.data ?? []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load requirements");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const analyze = useCallback(async (source: string, automatic = false) => {
    if (source.trim().length < 10) return;
    const currentRequest = ++requestId.current;
    if (automatic) setAutoAnalyzing(true); else setAnalyzing(true);
    setError("");
    try {
      const response = await fetch("/api/nlp/extract", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: source, mode: "requirements" }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (currentRequest !== requestId.current) return;
      setExtraction(result.extraction);
      setAnalyzedText(source);
      const names: string[] = result.extraction.acceptedCategories.value ?? [];
      const ids = categories.filter((category) => names.includes(category.name)).map((category) => category.id);
      if (ids.length) setSelected(ids);
    } catch (reason) {
      if (currentRequest === requestId.current) setError(reason instanceof Error ? reason.message : "Could not analyze requirements");
    } finally {
      if (currentRequest === requestId.current) {
        setAnalyzing(false);
        setAutoAnalyzing(false);
      }
    }
  }, [categories]);

  useEffect(() => {
    if (!extraction || text === analyzedText || text.trim().length < 10) return;
    const timer = window.setTimeout(() => analyze(text, true), 700);
    return () => window.clearTimeout(timer);
  }, [analyze, analyzedText, extraction, text]);

  function updateText(value: string) {
    setText(value);
    setMessage("");
    if (value.trim().length < 10) {
      requestId.current += 1;
      setExtraction(null);
      setAnalyzedText("");
      setAutoAnalyzing(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    const raw = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requirementsText: text,
          maxCapacityKg: Number(raw.maxCapacityKg),
          currentCapacityKg: Number(raw.currentCapacityKg),
          maxTravelDistanceKm: Number(raw.maxTravelDistanceKm),
          hasTransport: raw.hasTransport === "on",
          acceptsPartial: raw.acceptsPartial === "on",
          pickupStart: raw.pickupStart,
          pickupEnd: raw.pickupEnd,
          acceptedCategoryIds: selected,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not save requirements");
      setMessage("Requirements saved. New match calculations use these constraints immediately.");
      setProfile(result);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save requirements");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="grid min-h-[60vh] place-items-center"><RefreshCw className="animate-spin text-[#51da98]"/></div>;
  if (!profile || profile.account.role !== "NGO") return <div className="card p-8 text-center"><h1 className="font-extrabold">NGO profile required</h1><p className="mt-2 text-sm text-[#75817b]">This workspace is available to recipient accounts.</p></div>;

  const hours = profile.requirements?.operatingHours[0];
  const fresh = Boolean(extraction && analyzedText === text);

  return <div>
    <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
      <div><p className="eyebrow">Recipient intelligence</p><h1 className="mt-2 text-3xl font-black tracking-[-.04em] text-[var(--forest-950)] sm:text-4xl">Requirements that drive real matches.</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#68756f]">Edit the sentence or the authoritative controls. Source-text analysis now refreshes automatically.</p></div>
      <span className={`rounded-full border px-3 py-1.5 text-xs font-extrabold ${profile.organization.verificationStatus === "VERIFIED" ? "border-[#276348] bg-[#123a2a] text-[#70e3aa]" : "border-[#765820] bg-[#32250d] text-[#f0c66d]"}`}>{profile.organization.verificationStatus}</span>
    </div>

    <div className="mt-6 grid gap-6 xl:grid-cols-[.8fr_1.2fr]">
      <section className="card h-fit overflow-hidden">
        <div className="border-b border-[#22372f] p-5 sm:p-6">
          <div className="flex items-center justify-between"><div><h2 className="font-extrabold">Natural-language needs</h2><p className="mt-1 text-xs text-[#7a8580]">Analysis follows your current text</p></div><span className="grid size-10 place-items-center rounded-xl border border-[#59416a] bg-[#2c1f35] text-[#d3a6e7]"><WandSparkles size={19}/></span></div>
          <textarea value={text} onChange={(event) => updateText(event.target.value)} className="input mt-5 min-h-56 resize-none leading-6" placeholder="Our shelter accepts vegetarian cooked meals…"/>
          <button type="button" onClick={() => analyze(text)} disabled={analyzing || autoAnalyzing || text.trim().length < 10} className="btn-secondary mt-4 w-full">{analyzing || autoAnalyzing ? <LoaderCircle size={16} className="animate-spin"/> : <Sparkles size={16}/>} {analyzing ? "Extracting…" : autoAnalyzing ? "Refreshing after edit…" : extraction ? "Analyze again" : "Analyze requirements"}</button>
        </div>

        <div className="p-5 sm:p-6">
          <div className={`rounded-xl border p-4 ${fresh ? "border-[#285d46] bg-[#102a20]" : autoAnalyzing ? "border-[#715522] bg-[#2b210e]" : "border-[#263b32] bg-[#0c1813]"}`}>
            <p className="flex items-center gap-2 text-xs font-extrabold">{autoAnalyzing ? <RefreshCw size={14} className="animate-spin text-[#f0c66d]"/> : fresh ? <CheckCircle2 size={14} className="text-[#65e4a6]"/> : <Info size={14}/>} {autoAnalyzing ? "Updating from edited text" : fresh ? "Analysis is current" : "Run analysis to structure this text"}</p>
            <p className="mt-2 text-[11px] leading-5 text-[#80948a]">Changing the text triggers a new extraction after you pause typing.</p>
          </div>

          {extraction && <div className="mt-4 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Insight icon={Scale} label="Capacity" value={extraction.capacityKg.value == null ? "Unknown" : `${extraction.capacityKg.value} kg`}/>
              <Insight icon={Clock3} label="Pickup window" value={extraction.pickupWindow.value ? `${extraction.pickupWindow.value.start}–${extraction.pickupWindow.value.end}` : "Unknown"}/>
              <Insight icon={Truck} label="Collection" value={extraction.transportation.value == null ? "Unknown" : extraction.transportation.value ? "Available" : "Unavailable"}/>
              <Insight icon={Sparkles} label="Categories" value={String(extraction.acceptedCategories.value.length)}/>
            </div>
            <div className="rounded-xl border border-[#263b32] bg-[#0b1712] p-4 text-xs leading-5"><p className="font-extrabold text-[#dcebe4]">Extracted categories</p><p className="mt-1 text-[#8ea299]">{extraction.acceptedCategories.value.join(", ") || "Unknown — choose manually"}</p></div>
            {extraction.clarifications.length > 0 && <div className="rounded-xl border border-[#684f21] bg-[#2b210e] p-4 text-xs text-[#c6ad75]"><p className="flex items-center gap-2 font-extrabold text-[#f0c66d]"><AlertCircle size={14}/>Clarify before relying on it</p>{extraction.clarifications.map((item) => <p className="mt-1" key={item}>• {item}</p>)}</div>}
          </div>}

          <div className="mt-5 rounded-xl border border-[#263b32] bg-[#0b1712] p-4 text-[11px] leading-5 text-[#81958b]"><Info size={14} className="mr-1 inline text-[#54c98f]"/>English extraction is tested. Hindi and Kannada still require full manual review.</div>
        </div>
      </section>

      <form onSubmit={save} className="card p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3"><div><h2 className="font-extrabold">Authoritative matching constraints</h2><p className="mt-1 text-xs text-[#7a8580]">These saved controls—not NLP guesses—decide eligibility.</p></div><span className="rounded-full border border-[#315a78] bg-[#142c3d] px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-[#8bc5ef]">Hard rules</span></div>

        <div className="mt-6"><label className="label">Accepted food categories</label><div className="grid gap-2 sm:grid-cols-2">{categories.map((category) => { const active = selected.includes(category.id); return <button type="button" key={category.id} onClick={() => setSelected((current) => active ? current.filter((id) => id !== category.id) : [...current, category.id])} className={`flex items-center justify-between rounded-xl border p-3 text-left text-sm font-bold transition ${active ? "border-[#347859] bg-[#123a2a] text-[#a9f1cd]" : "border-[#283e35] bg-[#0b1712] text-[#9bafa5] hover:border-[#3a5d4e]"}`}>{category.name}<span className={`grid size-5 place-items-center rounded ${active ? "bg-[#40c986] text-[#06110d]" : "bg-[#17251f]"}`}>{active && <Check size={13}/>}</span></button>; })}</div></div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field icon={Scale} label="Maximum capacity (kg)"><input name="maxCapacityKg" type="number" min="0.1" step="0.1" className="input" defaultValue={profile.organization.maxCapacityKg}/></Field>
          <Field icon={Scale} label="Current capacity (kg)"><input name="currentCapacityKg" type="number" min="0" step="0.1" className="input" defaultValue={profile.organization.currentCapacityKg}/></Field>
          <Field icon={MapPin} label="Maximum travel (km)"><input name="maxTravelDistanceKm" type="number" min="1" step="0.5" className="input" defaultValue={profile.organization.maxTravelDistanceKm}/></Field>
          <Field icon={Clock3} label="Pickup starts"><input name="pickupStart" type="time" className="input" defaultValue={hours?.opensAt.slice(0, 5) ?? "18:00"}/></Field>
          <Field icon={Clock3} label="Pickup ends"><input name="pickupEnd" type="time" className="input" defaultValue={hours?.closesAt.slice(0, 5) ?? "22:00"}/></Field>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Toggle name="hasTransport" defaultChecked={profile.organization.hasTransport} icon={Truck} title="Transport available" text="Our team can collect within the travel radius."/>
          <Toggle name="acceptsPartial" defaultChecked={profile.organization.acceptsPartial} icon={Scale} title="Partial quantity accepted" text="Allow offers up to current available capacity."/>
        </div>

        {error && <div className="mt-4 rounded-xl border border-[#733d35] bg-[#301916] p-3 text-sm text-[#f2a095]">{error}</div>}
        {message && <div className="mt-4 rounded-xl border border-[#285d46] bg-[#102a20] p-3 text-sm text-[#70e3aa]">{message}</div>}
        <div className="mt-6 flex justify-end"><button disabled={saving || !selected.length} className="btn-primary"><Save size={16}/>{saving ? "Saving…" : "Save & recalculate future matches"}</button></div>
      </form>
    </div>
  </div>;
}

function Insight({ icon: Icon, label, value }: { icon: typeof Scale; label: string; value: string }) {
  return <div className="rounded-xl border border-[#263b32] bg-[#0b1712] p-3"><Icon size={14} className="text-[#54d596]"/><p className="mt-2 truncate text-xs font-extrabold text-[#dcebe4]">{value}</p><p className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-[#667a70]">{label}</p></div>;
}

function Field({ icon: Icon, label, children }: { icon: typeof Scale; label: string; children: React.ReactNode }) {
  return <div><label className="label flex items-center gap-1.5"><Icon size={13}/>{label}</label>{children}</div>;
}

function Toggle({ name, defaultChecked, icon: Icon, title, text }: { name: string; defaultChecked: boolean; icon: typeof Scale; title: string; text: string }) {
  return <label className="flex items-start gap-3 rounded-xl border border-[#283f35] bg-[#0b1712] p-4 hover:border-[#3b6251]"><input name={name} type="checkbox" defaultChecked={defaultChecked} className="mt-1 size-4 accent-[#44d18e]"/><span><span className="flex items-center gap-2 text-xs font-extrabold text-[#dcebe4]"><Icon size={15}/>{title}</span><span className="mt-1 block text-[11px] leading-5 text-[#75817b]">{text}</span></span></label>;
}
