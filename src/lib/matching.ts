export type DonationForMatch = {
  quantityKg: number;
  categoryId: string;
  categoryName: string;
  description: string;
  dietaryTags: string[];
  storageCondition: string | null;
  latitude: number | null;
  longitude: number | null;
  availableFrom: Date;
  pickupDeadline: Date;
  safetyReviewed: boolean;
};

export type NgoForMatch = {
  id: string;
  name: string;
  acceptedCategoryIds: string[];
  acceptedCategoryNames: string[];
  requirementsText: string;
  dietaryPreferences: string[];
  storageCapabilities: string[];
  currentCapacityKg: number;
  maxTravelDistanceKm: number;
  hasTransport: boolean;
  acceptsPartial: boolean;
  verificationStatus: "PENDING" | "VERIFIED" | "SUSPENDED";
  latitude: number | null;
  longitude: number | null;
  pickupWindowStart: string;
  pickupWindowEnd: string;
};

export type ScoreWeights = {
  compatibility: number;
  capacity: number;
  timing: number;
  distance: number;
  semantic: number;
};

export type MatchResult = {
  ngoId: string;
  ngoName: string;
  eligible: boolean;
  score: number;
  scoreBreakdown: Record<keyof ScoreWeights, number>;
  distanceKm: number | null;
  eligibleQuantityKg: number;
  reasons: string[];
  rejectionReasons: string[];
};

export const defaultWeights: ScoreWeights = {
  compatibility: 0.3,
  capacity: 0.2,
  timing: 0.2,
  distance: 0.15,
  semantic: 0.15,
};

function toRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const earthRadiusKm = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function tokens(text: string) {
  return new Set(text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((word) => word.length > 2));
}

export function semanticSimilarity(first: string, second: string) {
  const a = tokens(first);
  const b = tokens(second);
  if (!a.size || !b.size) return 0;
  const intersection = [...a].filter((token) => b.has(token)).length;
  const union = new Set([...a, ...b]).size;
  return intersection / union;
}

function minutesFromClock(clock: string) {
  const [hour, minute] = clock.split(":").map(Number);
  return hour * 60 + minute;
}

function timingCompatibility(donation: DonationForMatch, ngo: NgoForMatch) {
  const start = minutesFromClock(ngo.pickupWindowStart);
  const end = minutesFromClock(ngo.pickupWindowEnd);
  const availableIst = new Date(donation.availableFrom.getTime() + 330 * 60_000);
  const deadlineIst = new Date(donation.pickupDeadline.getTime() + 330 * 60_000);
  const donationStart = availableIst.getUTCHours() * 60 + availableIst.getUTCMinutes();
  const donationEnd = deadlineIst.getUTCHours() * 60 + deadlineIst.getUTCMinutes();
  const overlap = Math.max(0, Math.min(end, donationEnd) - Math.max(start, donationStart));
  const donationWindow = Math.max(1, donationEnd - donationStart);
  return Math.min(1, overlap / Math.min(120, donationWindow));
}

function normalizedWeights(weights: ScoreWeights) {
  const sum = Object.values(weights).reduce((total, value) => total + Math.max(0, value), 0) || 1;
  return Object.fromEntries(Object.entries(weights).map(([key, value]) => [key, Math.max(0, value) / sum])) as ScoreWeights;
}

export function rankNgoMatches(donation: DonationForMatch, ngos: NgoForMatch[], weights = defaultWeights): MatchResult[] {
  const w = normalizedWeights(weights);
  return ngos.map((ngo) => {
    const rejectionReasons: string[] = [];
    const reasons: string[] = [];
    if (ngo.verificationStatus !== "VERIFIED") rejectionReasons.push("Recipient is not currently verified and eligible.");
    if (!donation.safetyReviewed) rejectionReasons.push("Donation safety conditions require manual review.");
    if (donation.pickupDeadline.getTime() <= Date.now()) rejectionReasons.push("The verified pickup deadline has passed.");
    if (!ngo.acceptedCategoryIds.includes(donation.categoryId)) rejectionReasons.push(`${donation.categoryName} is not an accepted category.`);
    if (ngo.currentCapacityKg <= 0) rejectionReasons.push("No receiving capacity is available.");
    if (ngo.currentCapacityKg < donation.quantityKg && !ngo.acceptsPartial) rejectionReasons.push("Capacity is below the offered quantity and partial acceptance is disabled.");
    if (donation.storageCondition && !ngo.storageCapabilities.includes(donation.storageCondition) && !ngo.storageCapabilities.includes("ANY")) rejectionReasons.push(`Required ${donation.storageCondition.toLowerCase()} handling is unavailable.`);
    const incompatibleDiet = donation.dietaryTags.includes("NON_VEGETARIAN") && ngo.dietaryPreferences.includes("VEGETARIAN_ONLY");
    if (incompatibleDiet) rejectionReasons.push("Dietary requirements are incompatible.");
    const timing = timingCompatibility(donation, ngo);
    if (timing <= 0) rejectionReasons.push("Pickup windows do not overlap.");

    let distanceKm: number | null = null;
    if (donation.latitude != null && donation.longitude != null && ngo.latitude != null && ngo.longitude != null) {
      distanceKm = haversineKm(donation.latitude, donation.longitude, ngo.latitude, ngo.longitude);
      if (distanceKm > ngo.maxTravelDistanceKm) rejectionReasons.push(`Distance exceeds the ${ngo.maxTravelDistanceKm} km travel limit.`);
    } else if (!ngo.hasTransport) {
      rejectionReasons.push("Distance is unknown and the recipient has no collection transport.");
    }

    const capacity = Math.min(1, ngo.currentCapacityKg / donation.quantityKg);
    const compatibility = ngo.acceptedCategoryIds.includes(donation.categoryId) && !incompatibleDiet ? 1 : 0;
    const distance = distanceKm == null ? 0.5 : Math.max(0, 1 - distanceKm / Math.max(1, ngo.maxTravelDistanceKm));
    const semantic = semanticSimilarity(`${donation.categoryName} ${donation.description} ${donation.dietaryTags.join(" ")}`, `${ngo.acceptedCategoryNames.join(" ")} ${ngo.requirementsText} ${ngo.dietaryPreferences.join(" ")}`);
    const scoreBreakdown = { compatibility, capacity, timing, distance, semantic };
    const score = Object.entries(scoreBreakdown).reduce((total, [key, value]) => total + value * w[key as keyof ScoreWeights], 0) * 100;
    if (compatibility === 1) reasons.push("Accepted food category and dietary profile match.");
    if (capacity >= 1) reasons.push("Can receive the full available quantity.");
    else if (capacity > 0) reasons.push(`Can receive a partial quantity of ${ngo.currentCapacityKg.toFixed(1)} kg.`);
    if (timing >= 0.75) reasons.push("Strong overlap with the pickup window.");
    if (distanceKm != null) reasons.push(`${distanceKm.toFixed(1)} km straight-line demo estimate.`);
    if (semantic >= 0.1) reasons.push("Requirement text is semantically relevant.");
    return {
      ngoId: ngo.id,
      ngoName: ngo.name,
      eligible: rejectionReasons.length === 0,
      score: Math.round(score),
      scoreBreakdown: Object.fromEntries(Object.entries(scoreBreakdown).map(([key, value]) => [key, Math.round(value * 100)])) as Record<keyof ScoreWeights, number>,
      distanceKm: distanceKm == null ? null : Math.round(distanceKm * 10) / 10,
      eligibleQuantityKg: Math.min(donation.quantityKg, ngo.currentCapacityKg),
      reasons,
      rejectionReasons,
    };
  }).sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.score - a.score);
}
