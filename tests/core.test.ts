import test from "node:test";
import assert from "node:assert/strict";
import { extractDonation, extractRequirements } from "../src/lib/nlp";
import { chronologicalEvaluation, generateForecast, preprocessHistory, type HistoryPoint } from "../src/lib/forecasting";
import { rankNgoMatches, type DonationForMatch, type NgoForMatch } from "../src/lib/matching";
import { classifyUrgency } from "../src/lib/safety";

test("donation NLP extracts explicit quantity, category, diet, and times", () => {
  const result = extractDonation("We have around 18 kg of vegetarian rice and curry available at 8:30 PM today. It is hot-held and packed. Collect before 10 PM.");
  assert.equal(result.quantityKg.value, 18);
  assert.equal(result.quantityKg.source, "explicit");
  assert.equal(result.category.value, "Cooked Meals");
  assert.deepEqual(result.dietaryTags.value, ["VEGETARIAN"]);
  assert.equal(result.storageCondition.value, "HOT_HELD");
  assert.ok(result.availableFrom.value);
  assert.ok(result.pickupDeadline.value);
});

test("donation NLP leaves unstated safety values unknown", () => {
  const result = extractDonation("There are 7 kg of bread available for collection.");
  assert.equal(result.storageCondition.value, null);
  assert.equal(result.packagingCondition.value, null);
  assert.ok(result.clarifications.some((item) => item.includes("Storage condition")));
});

test("requirement NLP extracts capacity and pickup range", () => {
  const result = extractRequirements("We accept vegetarian cooked meals, bread and fruits. We can collect up to 35 kg between 7 PM and 10 PM.");
  assert.equal(result.capacityKg.value, 35);
  assert.deepEqual(result.pickupWindow.value, { start: "19:00", end: "22:00" });
  assert.ok(result.acceptedCategories.value?.includes("Cooked Meals"));
});

test("preprocessing is chronological and fills missing values without negative quantities", () => {
  const cleaned = preprocessHistory([
    { date: "2026-01-02", preparedKg: null, soldKg: 10, leftoverKg: -2 },
    { date: "2026-01-01", preparedKg: 14, soldKg: 11, leftoverKg: 3 },
  ]);
  assert.equal(cleaned[0].date, "2026-01-01");
  assert.ok(cleaned.every((point) => point.surplusKg >= 0));
});

test("forecast is deterministic and evaluation uses chronological holdout", () => {
  const history: HistoryPoint[] = Array.from({ length: 35 }, (_, index) => ({
    date: new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10),
    preparedKg: 30 + (index % 7),
    soldKg: 25 + (index % 7),
    leftoverKg: 5,
  }));
  assert.deepEqual(generateForecast(history, 7), generateForecast(history, 7));
  const metrics = chronologicalEvaluation(history);
  assert.equal(metrics.samples, 7);
  assert.equal(metrics.mae, 0);
  assert.equal(metrics.rmse, 0);
});

test("safety engine blocks expired and unresolved donations", () => {
  const now = new Date("2026-01-01T12:00:00Z");
  assert.equal(classifyUrgency({ pickupDeadline: new Date("2026-01-01T11:59:00Z"), storageCondition: "AMBIENT", packagingCondition: "PACKED", safetyReviewed: true, now }).acceptingAllowed, false);
  const unresolved = classifyUrgency({ pickupDeadline: new Date("2026-01-01T15:00:00Z"), storageCondition: null, packagingCondition: "PACKED", safetyReviewed: false, now });
  assert.equal(unresolved.urgency, "MANUAL_REVIEW");
  assert.equal(unresolved.acceptingAllowed, false);
});

const donation: DonationForMatch = {
  quantityKg: 18,
  categoryId: "cooked",
  categoryName: "Cooked Meals",
  description: "Vegetarian rice and curry",
  dietaryTags: ["VEGETARIAN"],
  storageCondition: "HOT_HELD",
  latitude: 12.9719,
  longitude: 77.6412,
  availableFrom: new Date("2099-01-01T13:30:00Z"),
  pickupDeadline: new Date("2099-01-01T16:30:00Z"),
  safetyReviewed: true,
};
const eligibleNgo: NgoForMatch = {
  id: "eligible",
  name: "Eligible Kitchen",
  acceptedCategoryIds: ["cooked"],
  acceptedCategoryNames: ["Cooked Meals"],
  requirementsText: "vegetarian rice meals",
  dietaryPreferences: ["VEGETARIAN"],
  storageCapabilities: ["HOT_HELD"],
  currentCapacityKg: 35,
  maxTravelDistanceKm: 15,
  hasTransport: true,
  acceptsPartial: true,
  verificationStatus: "VERIFIED",
  latitude: 12.9611,
  longitude: 77.6387,
  pickupWindowStart: "19:00",
  pickupWindowEnd: "22:00",
};

test("hard category constraint cannot be overridden by semantic score", () => {
  const incompatible = { ...eligibleNgo, id: "wrong", acceptedCategoryIds: [], requirementsText: "vegetarian rice curry cooked meal rice curry" };
  const [result] = rankNgoMatches(donation, [incompatible]);
  assert.equal(result.eligible, false);
  assert.ok(result.rejectionReasons.some((reason) => reason.includes("not an accepted category")));
});

test("partial capacity is eligible only when recipient permits it", () => {
  const partial = { ...eligibleNgo, currentCapacityKg: 8, acceptsPartial: true };
  const blocked = { ...eligibleNgo, id: "blocked", currentCapacityKg: 8, acceptsPartial: false };
  const results = rankNgoMatches(donation, [partial, blocked]);
  assert.equal(results.find((result) => result.ngoId === "eligible")?.eligible, true);
  assert.equal(results.find((result) => result.ngoId === "eligible")?.eligibleQuantityKg, 8);
  assert.equal(results.find((result) => result.ngoId === "blocked")?.eligible, false);
});

test("verified compatible recipient ranks above ineligible recipient", () => {
  const suspended = { ...eligibleNgo, id: "suspended", verificationStatus: "SUSPENDED" as const };
  const results = rankNgoMatches(donation, [suspended, eligibleNgo]);
  assert.equal(results[0].ngoId, "eligible");
  assert.equal(results[0].eligible, true);
});
