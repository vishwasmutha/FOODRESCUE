export type ExtractedField<T> = {
  value: T | null;
  confidence: number;
  source: "explicit" | "inferred_category" | "unknown";
  evidence?: string;
};

export type DonationExtraction = {
  quantityKg: ExtractedField<number>;
  foodName: ExtractedField<string>;
  category: ExtractedField<string>;
  dietaryTags: ExtractedField<string[]>;
  availableFrom: ExtractedField<string>;
  pickupDeadline: ExtractedField<string>;
  storageCondition: ExtractedField<string>;
  packagingCondition: ExtractedField<string>;
  language: "English" | "Hindi" | "Kannada" | "Mixed";
  clarifications: string[];
};

export type RequirementExtraction = {
  acceptedCategories: ExtractedField<string[]>;
  capacityKg: ExtractedField<number>;
  pickupWindow: ExtractedField<{ start: string; end: string }>;
  dietaryTags: ExtractedField<string[]>;
  storageRequirements: ExtractedField<string[]>;
  transportation: ExtractedField<boolean>;
  clarifications: string[];
};

const categoryLexicon: Array<{ category: string; words: string[] }> = [
  { category: "Cooked Meals", words: ["rice", "curry", "biryani", "meal", "dal", "sambar", "idli", "dosa", "chapati", "upma"] },
  { category: "Bakery & Bread", words: ["bread", "bun", "cake", "pastry", "bakery", "roti"] },
  { category: "Fresh Produce", words: ["fruit", "fruits", "vegetable", "vegetables", "banana", "apple", "tomato"] },
  { category: "Packaged Food", words: ["packaged", "packet", "sealed", "canned", "dry ration"] },
  { category: "Dairy", words: ["milk", "curd", "yogurt", "paneer", "dairy"] },
];

const quantityPattern = /(\d+(?:\.\d+)?)\s*(kg|kgs|kilograms?|g|grams?|portions?|servings?)/gi;
const timePattern = /(?:at|from|between|by|before|until|till|collection before|available at)?\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)/gi;

function field<T>(value: T | null, confidence: number, source: ExtractedField<T>["source"], evidence?: string): ExtractedField<T> {
  return { value, confidence, source, ...(evidence ? { evidence } : {}) };
}

function detectLanguage(text: string): DonationExtraction["language"] {
  const devanagari = /[\u0900-\u097F]/.test(text);
  const kannada = /[\u0C80-\u0CFF]/.test(text);
  const latin = /[A-Za-z]/.test(text);
  if ((devanagari || kannada) && latin) return "Mixed";
  if (devanagari) return "Hindi";
  if (kannada) return "Kannada";
  return "English";
}

function extractQuantities(text: string) {
  return [...text.matchAll(quantityPattern)].map((match) => {
    const raw = Number(match[1]);
    const unit = match[2].toLowerCase();
    const kg = unit === "g" || unit.startsWith("gram") ? raw / 1000 : unit.startsWith("portion") || unit.startsWith("serving") ? raw * 0.35 : raw;
    return { kg: Math.round(kg * 100) / 100, evidence: match[0], approximate: unit.startsWith("portion") || unit.startsWith("serving") };
  });
}

function timeMatches(text: string) {
  return [...text.matchAll(timePattern)].map((match) => {
    let hour = Number(match[1]);
    const minute = Number(match[2] ?? 0);
    const meridiem = match[3].toLowerCase();
    if (meridiem === "pm" && hour !== 12) hour += 12;
    if (meridiem === "am" && hour === 12) hour = 0;
    return { hour, minute, evidence: match[0].trim(), index: match.index ?? 0 };
  });
}

function localIstDate(hour: number, minute: number, dayOffset: number) {
  const istNow = new Date(Date.now() + 330 * 60_000);
  const utcMs = Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate() + dayOffset, hour, minute) - 330 * 60_000;
  return new Date(utcMs).toISOString();
}

function findCategory(text: string) {
  const lower = text.toLowerCase();
  const scored = categoryLexicon.map((entry) => ({
    category: entry.category,
    words: entry.words.filter((word) => lower.includes(word)),
  })).filter((entry) => entry.words.length > 0).sort((a, b) => b.words.length - a.words.length);
  return scored[0] ?? null;
}

function dietary(text: string) {
  const lower = text.toLowerCase();
  const tags: string[] = [];
  if (/\b(vegetarian|veg)\b/.test(lower) && !/non[- ]?veg/.test(lower)) tags.push("VEGETARIAN");
  if (/\b(vegan)\b/.test(lower)) tags.push("VEGAN");
  if (/\b(halal)\b/.test(lower)) tags.push("HALAL");
  if (/\b(jain)\b/.test(lower)) tags.push("JAIN");
  if (/non[- ]?veg|chicken|mutton|fish|egg/.test(lower)) tags.push("NON_VEGETARIAN");
  return tags;
}

function extractFoodName(text: string, quantityEvidence?: string) {
  const lower = text.toLowerCase();
  const matchedWords = categoryLexicon.flatMap((entry) => entry.words).filter((word) => lower.includes(word));
  const compound = matchedWords.slice(0, 3).join(" and ");
  if (compound) return compound.replace(/\b\w/g, (letter) => letter.toUpperCase());
  if (quantityEvidence) {
    const index = lower.indexOf(quantityEvidence.toLowerCase());
    const after = text.slice(index + quantityEvidence.length).replace(/^(\s+of)?\s+/i, "").split(/\b(?:available|ready|prepared|at|by|before)\b/i)[0].trim();
    if (after && after.length < 100) return after;
  }
  return null;
}

export function extractDonation(text: string, now = new Date()): DonationExtraction {
  void now;
  const quantities = extractQuantities(text);
  const times = timeMatches(text);
  const category = findCategory(text);
  const tags = dietary(text);
  const lower = text.toLowerCase();
  const clarifications: string[] = [];
  const dayOffset = /tomorrow/i.test(text) ? 1 : 0;

  if (quantities.length === 0) clarifications.push("Please provide the donation quantity in kilograms.");
  if (quantities.length > 1) clarifications.push("Multiple quantities were found. Confirm the total donation quantity.");
  if (quantities[0]?.approximate) clarifications.push("Portions were converted using the demo assumption of 0.35 kg per portion. Confirm the kilogram quantity.");
  if (times.length === 0) clarifications.push("Please provide availability and pickup deadline times.");
  if (times.length === 1) clarifications.push("Only one time was found. Confirm whether it is availability or the pickup deadline.");
  if (!category) clarifications.push("Food category could not be determined. Please select one.");

  const availabilityTime = times[0];
  const deadlineTime = times.length > 1 ? times[times.length - 1] : undefined;
  let availableIso = availabilityTime ? localIstDate(availabilityTime.hour, availabilityTime.minute, dayOffset) : null;
  let deadlineIso = deadlineTime ? localIstDate(deadlineTime.hour, deadlineTime.minute, dayOffset) : null;
  if (availableIso && deadlineIso && new Date(deadlineIso) <= new Date(availableIso)) {
    deadlineIso = localIstDate(deadlineTime!.hour, deadlineTime!.minute, dayOffset + 1);
    clarifications.push("The deadline appears to cross midnight. Confirm the interpreted date.");
  }

  let storage: string | null = null;
  let storageEvidence: string | undefined;
  if (/refrigerat|chilled|cold storage/i.test(text)) { storage = "CHILLED"; storageEvidence = "refrigerated/chilled"; }
  else if (/frozen|freezer/i.test(text)) { storage = "FROZEN"; storageEvidence = "frozen/freezer"; }
  else if (/hot[- ]?held|kept hot/i.test(text)) { storage = "HOT_HELD"; storageEvidence = "hot-held/kept hot"; }
  else if (/room temperature|ambient/i.test(text)) { storage = "AMBIENT"; storageEvidence = "room temperature/ambient"; }
  else clarifications.push("Storage condition is unknown and requires safety review.");

  let packaging: string | null = null;
  if (/sealed|tamper[- ]?proof/i.test(text)) packaging = "SEALED";
  else if (/packed|container|boxed/i.test(text)) packaging = "PACKED";

  const foodName = extractFoodName(text, quantities[0]?.evidence);
  return {
    quantityKg: quantities[0] ? field(quantities[0].kg, quantities[0].approximate ? 0.72 : 0.98, "explicit", quantities[0].evidence) : field<number>(null, 0, "unknown"),
    foodName: foodName ? field(foodName, 0.78, "explicit", foodName) : field<string>(null, 0, "unknown"),
    category: category ? field(category.category, 0.86, "inferred_category", category.words.join(", ")) : field<string>(null, 0, "unknown"),
    dietaryTags: tags.length ? field(tags, 0.94, "explicit", tags.join(", ")) : field<string[]>([], 0.4, "unknown"),
    availableFrom: availableIso ? field(availableIso, 0.82, "explicit", availabilityTime?.evidence) : field<string>(null, 0, "unknown"),
    pickupDeadline: deadlineIso ? field(deadlineIso, 0.9, "explicit", deadlineTime?.evidence) : field<string>(null, 0, "unknown"),
    storageCondition: storage ? field(storage, 0.9, "explicit", storageEvidence) : field<string>(null, 0, "unknown"),
    packagingCondition: packaging ? field(packaging, 0.86, "explicit", packaging) : field<string>(null, 0, "unknown"),
    language: detectLanguage(text),
    clarifications,
  };
}

export function extractRequirements(text: string): RequirementExtraction {
  const lower = text.toLowerCase();
  const quantities = extractQuantities(text);
  const times = timeMatches(text);
  const categories = categoryLexicon.filter((entry) => entry.words.some((word) => lower.includes(word))).map((entry) => entry.category);
  const tags = dietary(text);
  const storage: string[] = [];
  if (/refrigerat|chilled|cold storage/.test(lower)) storage.push("CHILLED");
  if (/frozen|freezer/.test(lower)) storage.push("FROZEN");
  if (/safely stored|food-safe|sealed/.test(lower)) storage.push("SAFE_HANDLING_REQUIRED");
  const clarifications: string[] = [];
  if (!categories.length) clarifications.push("Select at least one accepted food category.");
  if (!quantities.length) clarifications.push("Provide the maximum receiving capacity in kilograms.");
  if (times.length < 2) clarifications.push("Provide both the start and end of the pickup window.");
  const transportExplicit = /(?:we|our team) can (?:collect|pick up)|transport available/.test(lower);
  const noTransport = /no transport|cannot collect|delivery only/.test(lower);
  return {
    acceptedCategories: categories.length ? field(categories, 0.9, "explicit", categories.join(", ")) : field([], 0, "unknown"),
    capacityKg: quantities[0] ? field(quantities[0].kg, 0.98, "explicit", quantities[0].evidence) : field<number>(null, 0, "unknown"),
    pickupWindow: times.length >= 2 ? field({ start: `${String(times[0].hour).padStart(2, "0")}:${String(times[0].minute).padStart(2, "0")}`, end: `${String(times[1].hour).padStart(2, "0")}:${String(times[1].minute).padStart(2, "0")}` }, 0.92, "explicit", `${times[0].evidence} – ${times[1].evidence}`) : field<{ start: string; end: string }>(null, 0, "unknown"),
    dietaryTags: tags.length ? field(tags, 0.94, "explicit", tags.join(", ")) : field<string[]>([], 0.35, "unknown"),
    storageRequirements: storage.length ? field(storage, 0.86, "explicit", storage.join(", ")) : field<string[]>([], 0.35, "unknown"),
    transportation: transportExplicit ? field(true, 0.9, "explicit", "can collect") : noTransport ? field(false, 0.9, "explicit", "no transport/delivery only") : field<boolean>(null, 0, "unknown"),
    clarifications,
  };
}
