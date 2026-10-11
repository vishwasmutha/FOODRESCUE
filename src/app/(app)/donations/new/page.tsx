"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Info,
  LoaderCircle,
  PackageCheck,
  RefreshCw,
  Scale,
  ShieldAlert,
  Sparkles,
  WandSparkles,
} from "lucide-react";

type Field<T> = { value: T | null; confidence: number; source: string; evidence?: string };
type Extraction = {
  quantityKg: Field<number>;
  foodName: Field<string>;
  category: Field<string>;
  dietaryTags: Field<string[]>;
  availableFrom: Field<string>;
  pickupDeadline: Field<string>;
  storageCondition: Field<string>;
  packagingCondition: Field<string>;
  language: string;
  clarifications: string[];
};
type Category = { id: string; name: string };

const example = "We have around 18 kg of vegetarian rice and curry available at 8:30 PM today. It is hot-held and packed in food-grade containers. Please arrange collection before 10 PM.";

function localInput(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export default function NewDonationPage() {
  const router = useRouter();
  const requestId = useRef(0);
  const [text, setText] = useState(example);
  const [analyzedText, setAnalyzedText] = useState("");
  const [extraction, setExtraction] = useState<Extraction | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [autoAnalyzing, setAutoAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [reviewed, setReviewed] = useState(false);

  useEffect(() => {
    fetch("/api/categories", { cache: "no-store" }).then((response) => response.json()).then((data) => setCategories(data.data ?? []));
  }, []);

  const analyze = useCallback(async (source: string, automatic = false) => {
    if (source.trim().length < 10) return;
    const currentRequest = ++requestId.current;
    if (automatic) setAutoAnalyzing(true); else setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/nlp/extract", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: source, mode: "donation" }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not analyze description");
      if (currentRequest !== requestId.current) return;
      setExtraction(result.extraction);
      setAnalyzedText(source);
      setReviewed(false);
    } catch (reason) {
      if (currentRequest === requestId.current) setError(reason instanceof Error ? reason.message : "Could not analyze description");
    } finally {
      if (currentRequest === requestId.current) {
        setLoading(false);
        setAutoAnalyzing(false);
      }
    }
  }, []);

  // Once the first analysis exists, source edits are re-analysed after the user
  // pauses. This prevents review fields from silently representing old text.
  useEffect(() => {
    if (!extraction || text === analyzedText || text.trim().length < 10) return;
    const timer = window.setTimeout(() => analyze(text, true), 700);
    return () => window.clearTimeout(timer);
  }, [analyze, analyzedText, extraction, text]);

  function updateText(value: string) {
    setText(value);
    setReviewed(false);
    setError("");
    if (value.trim().length < 10) {
      requestId.current += 1;
      setExtraction(null);
      setAnalyzedText("");
      setAutoAnalyzing(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const publish = submitter?.value !== "draft";
    if (publish && analyzedText !== text) {
      setError("Wait for the updated text analysis before publishing.");
      return;
    }
    setSaving(true);
    setError("");
    const raw = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const category = categories.find((item) => item.id === raw.categoryId);
      const response = await fetch("/api/donations", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: raw.title,
          description: text,
          foodName: raw.foodName,
          categoryId: raw.categoryId,
          quantityKg: Number(raw.quantityKg),
          availableFrom: new Date(String(raw.availableFrom)).toISOString(),
          pickupDeadline: new Date(String(raw.pickupDeadline)).toISOString(),
          preparationTime: raw.preparationTime ? new Date(String(raw.preparationTime)).toISOString() : null,
          storageCondition: raw.storageCondition || null,
          packagingCondition: raw.packagingCondition || null,
          dietaryTags: String(raw.dietaryTags || "").split(",").map((item) => item.trim()).filter(Boolean),
          safetyReviewed: reviewed,
          safetyNotes: raw.safetyNotes,
          publish,
          extraction: extraction && analyzedText === text ? { ...extraction, analyzedText, reviewedFields: true, selectedCategory: category?.name } : { staleAnalysisDiscarded: true },
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not create donation");
      router.push(`/donations/${result.donation.id}`);
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not create donation");
    } finally {
      setSaving(false);
    }
  }

  const fresh = Boolean(extraction && analyzedText === text);
  const stale = Boolean(extraction && analyzedText !== text);
  const selectedCategory = categories.find((category) => category.name === extraction?.category.value)?.id ?? "";
  const analysisKey = `${analyzedText}-${extraction?.quantityKg.value ?? "unknown"}-${extraction?.pickupDeadline.value ?? "unknown"}`;

  return <div>
    <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-xs font-bold text-[#91a69c]"><ArrowLeft size={14}/>Back to overview</Link>

    <div className="mt-4 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
      <div>
        <p className="eyebrow">AI-assisted donation</p>
        <h1 className="mt-2 text-3xl font-black tracking-[-.04em] text-[var(--forest-950)] sm:text-4xl">Describe, review, then publish.</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#69756f]">Edits now refresh the extraction automatically. The final structured fields remain under your control.</p>
      </div>
      <div className="flex items-center gap-2 rounded-xl border border-[#253d33] bg-[#0c1914] p-2 text-[10px] font-black uppercase tracking-wider text-[#71877c]">
        <span className="grid size-7 place-items-center rounded-lg bg-[#1a5139] text-[#79ecb3]">1</span><span className="hidden sm:inline">Describe</span>
        <span className="h-px w-5 bg-[#294339]"/>
        <span className={`grid size-7 place-items-center rounded-lg ${fresh ? "bg-[#1a5139] text-[#79ecb3]" : "bg-[#17231e]"}`}>2</span><span className="hidden sm:inline">Review</span>
        <span className="h-px w-5 bg-[#294339]"/>
        <span className="grid size-7 place-items-center rounded-lg bg-[#17231e]">3</span><span className="hidden sm:inline">Match</span>
      </div>
    </div>

    <div className="mt-6 grid gap-6 xl:grid-cols-[.82fr_1.18fr]">
      <section className="card h-fit overflow-hidden">
        <div className="border-b border-[#22372f] p-5 sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <div><h2 className="font-extrabold">1. Donation description</h2><p className="mt-1 text-xs text-[#7d8883]">English rules tested · edit naturally</p></div>
            <span className="grid size-10 place-items-center rounded-xl border border-[#59416a] bg-[#2c1f35] text-[#d3a6e7]"><WandSparkles size={19}/></span>
          </div>
          <textarea value={text} onChange={(event) => updateText(event.target.value)} className="input mt-5 min-h-[235px] resize-none leading-6" maxLength={5000} aria-label="Natural-language donation description"/>
          <div className="mt-3 flex items-center justify-between text-[11px] text-[#89938e]">
            <button type="button" onClick={() => updateText(example)} className="font-bold text-[#5cdda0] hover:text-[#8aefbc]">Restore tested example</button><span>{text.length}/5000</span>
          </div>
          <button type="button" onClick={() => analyze(text)} disabled={loading || autoAnalyzing || text.trim().length < 10} className="btn-primary mt-5 w-full py-3">
            {loading || autoAnalyzing ? <LoaderCircle size={16} className="animate-spin"/> : <Sparkles size={16}/>}
            {loading ? "Extracting details…" : autoAnalyzing ? "Refreshing after your edit…" : extraction ? "Analyze again" : "Analyze description"}
          </button>
        </div>

        <div className="p-5 sm:p-6">
          <div className={`rounded-xl border p-4 ${fresh ? "border-[#285d46] bg-[#102a20]" : stale ? "border-[#715522] bg-[#2b210e]" : "border-[#263b32] bg-[#0c1813]"}`}>
            <div className="flex items-center gap-2 text-xs font-extrabold">
              {autoAnalyzing ? <RefreshCw size={15} className="animate-spin text-[#f0c66d]"/> : fresh ? <CheckCircle2 size={15} className="text-[#65e4a6]"/> : <Info size={15} className="text-[#82968c]"/>}
              {autoAnalyzing ? "Source changed — updating analysis" : fresh ? "Analysis matches the current text" : stale ? "Analysis is stale" : "No analysis yet"}
            </div>
            <p className="mt-2 text-[11px] leading-5 text-[#8fa39a]">After the first analysis, typing changes triggers a fresh extraction after 0.7 seconds. Older network responses are ignored.</p>
          </div>

          {extraction && <div className="mt-4 grid grid-cols-2 gap-2">
            <Summary icon={Scale} label="Quantity" value={extraction.quantityKg.value == null ? "Unknown" : `${extraction.quantityKg.value} kg`}/>
            <Summary icon={PackageCheck} label="Category" value={extraction.category.value ?? "Unknown"}/>
            <Summary icon={Clock3} label="Deadline" value={extraction.pickupDeadline.value ? new Date(extraction.pickupDeadline.value).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }) : "Unknown"}/>
            <Summary icon={ShieldAlert} label="Clarifications" value={String(extraction.clarifications.length)}/>
          </div>}

          <div className="mt-4 rounded-xl border border-[#263b32] bg-[#0b1712] p-4 text-[11px] leading-5 text-[#81958b]"><Info size={14} className="mr-1.5 inline text-[#54c98f]"/><b className="text-[#afc2b9]">Responsible parsing:</b> quantity and times require evidence. An inferred category is never a safety approval.</div>
        </div>
      </section>

      <section className="card min-h-[590px] p-5 sm:p-6">
        {!extraction
          ? <div className="grid min-h-[535px] place-items-center text-center"><div><span className="mx-auto grid size-16 place-items-center rounded-2xl border border-[#28523f] bg-[#102a20] text-[#5cdda0]"><Sparkles size={28}/></span><h2 className="mt-5 text-xl font-extrabold">2. Structured review</h2><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#75817b]">Analyze the description to create editable quantity, food, timing, dietary, storage, and packaging fields.</p></div></div>
          : <form key={analysisKey} onSubmit={submit}>
            <div className="flex items-start justify-between gap-3">
              <div><h2 className="font-extrabold">2. Review current extraction</h2><p className="mt-1 text-xs text-[#7d8883]">{fresh ? `Current ${extraction.language} source` : "Updating from changed source…"}</p></div>
              <span className={`rounded-full border px-2.5 py-1 text-[10px] font-extrabold ${fresh ? "border-[#286147] bg-[#123a2a] text-[#70e3aa]" : "border-[#765820] bg-[#32250d] text-[#f0c66d]"}`}>{fresh ? "IN SYNC" : "REFRESHING"}</span>
            </div>

            {extraction.clarifications.length > 0 && <div className="mt-5 rounded-xl border border-[#684f21] bg-[#2b210e] p-4"><p className="flex items-center gap-2 text-xs font-extrabold text-[#f0c66d]"><AlertCircle size={15}/>Needs your decision</p><ul className="mt-2 space-y-1 text-xs leading-5 text-[#c6ad75]">{extraction.clarifications.map((item) => <li key={item}>• {item}</li>)}</ul></div>}

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2"><label className="label">Listing title</label><input name="title" required className="input" defaultValue={extraction.foodName.value ?? "Food donation"}/></div>
              <div><label className="label">Food name</label><input name="foodName" required className="input" defaultValue={extraction.foodName.value ?? ""}/><Evidence field={extraction.foodName}/></div>
              <div><label className="label">Quantity (kg)</label><input name="quantityKg" type="number" min="0.1" step="0.1" required className="input" defaultValue={extraction.quantityKg.value ?? ""}/><Evidence field={extraction.quantityKg}/></div>
              <div><label className="label">Food category</label><select name="categoryId" required className="input" defaultValue={selectedCategory}><option value="">Select category</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select><Evidence field={extraction.category}/></div>
              <div><label className="label">Dietary tags</label><input name="dietaryTags" className="input" defaultValue={extraction.dietaryTags.value?.join(", ") ?? ""} placeholder="VEGETARIAN, HALAL"/><Evidence field={extraction.dietaryTags}/></div>
              <div><label className="label">Available from</label><input name="availableFrom" type="datetime-local" required className="input" defaultValue={localInput(extraction.availableFrom.value)}/><Evidence field={extraction.availableFrom}/></div>
              <div><label className="label">Pickup deadline</label><input name="pickupDeadline" type="datetime-local" required className="input" defaultValue={localInput(extraction.pickupDeadline.value)}/><Evidence field={extraction.pickupDeadline}/></div>
              <div><label className="label">Preparation time (optional)</label><input name="preparationTime" type="datetime-local" className="input"/></div>
              <div><label className="label">Storage condition</label><select name="storageCondition" className="input" defaultValue={extraction.storageCondition.value ?? ""}><option value="">Unknown — review required</option><option value="HOT_HELD">Hot-held</option><option value="CHILLED">Chilled</option><option value="FROZEN">Frozen</option><option value="AMBIENT">Ambient</option></select><Evidence field={extraction.storageCondition}/></div>
              <div><label className="label">Packaging condition</label><select name="packagingCondition" className="input" defaultValue={extraction.packagingCondition.value ?? ""}><option value="">Unknown — review required</option><option value="SEALED">Sealed</option><option value="PACKED">Packed container</option><option value="UNPACKAGED">Unpackaged</option></select><Evidence field={extraction.packagingCondition}/></div>
              <div><label className="label">Safety / allergen notes</label><input name="safetyNotes" className="input" placeholder="Observed handling information only"/></div>
            </div>

            <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-[#294238] bg-[#0b1813] p-4">
              <input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} className="mt-1 size-4 accent-[#44d18e]"/>
              <span><span className="block text-xs font-extrabold text-[#dbeae3]">I reviewed handling, packaging, and collection details</span><span className="mt-1 block text-[11px] leading-5 text-[#748079]">This records a manual review; it is not an automated safety certification.</span></span>
            </label>

            {error && <div role="alert" className="mt-4 rounded-lg border border-[#733d35] bg-[#301916] px-3 py-2 text-sm text-[#f2a095]">{error}</div>}
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button name="intent" value="draft" disabled={saving || autoAnalyzing} className="btn-secondary">Save reviewed draft</button>
              <button name="intent" value="publish" disabled={saving || !reviewed || !fresh || autoAnalyzing} className="btn-primary">{saving ? <LoaderCircle size={16} className="animate-spin"/> : null}{saving ? "Saving…" : "Publish & find matches"}<ArrowRight size={16}/></button>
            </div>
          </form>}
      </section>
    </div>
  </div>;
}

function Summary({ icon: Icon, label, value }: { icon: typeof Scale; label: string; value: string }) {
  return <div className="rounded-xl border border-[#263b32] bg-[#0b1712] p-3"><Icon size={14} className="text-[#54d596]"/><p className="mt-2 truncate text-xs font-extrabold text-[#dcebe4]">{value}</p><p className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-[#667a70]">{label}</p></div>;
}

function Evidence({ field }: { field: Field<unknown> }) {
  return <p className="mt-1.5 flex items-center gap-1 text-[10px] text-[#89938e]">{field.source === "unknown" ? <ShieldAlert size={11} className="text-[#e2b75d]"/> : <CheckCircle2 size={11} className="text-[#55d99a]"/>}{field.source.replace("_", " ")} · {Math.round(field.confidence * 100)}%{field.evidence ? ` · “${field.evidence}”` : ""}</p>;
}
