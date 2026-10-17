import "dotenv/config";
import { and, eq, inArray, like, notInArray } from "drizzle-orm";
import { db, pool } from "../src/db";
import {
  actualSurplus,
  businesses,
  donationItems,
  donationOffers,
  donations,
  foodCategories,
  modelEvaluations,
  modelVersions,
  ngoAcceptedCategories,
  ngoOperatingHours,
  ngos,
  notifications,
  pickupRecords,
  reservations,
  salesHistory,
  surplusPredictions,
  userFeedback,
  users,
} from "../src/db/schema";
import { chronologicalEvaluation, type HistoryPoint } from "../src/lib/forecasting";

// Fills every organization that is missing demo data (including accounts created through the signup form),
// so each page of the app has something to show. All rows are labelled SYNTHETIC / synthetic.
async function main() {
  // Remove throwaway accounts created by automated walkthroughs.
  const junk = await db.select({ id: users.id }).from(users).where(like(users.email, "%@example.com"));
  if (junk.length) await db.delete(users).where(inArray(users.id, junk.map((row) => row.id)));
  await db.delete(donations).where(like(donations.title, "Walkthrough%"));

  const categories = await db.select().from(foodCategories);
  const bySlug = Object.fromEntries(categories.map((category) => [category.slug, category]));
  const allBusinesses = await db.select().from(businesses);
  const allNgos = await db.select().from(ngos);

  // NGOs without accepted categories / hours cannot match anything.
  for (const ngo of allNgos) {
    const accepted = await db.select().from(ngoAcceptedCategories).where(eq(ngoAcceptedCategories.ngoId, ngo.id));
    if (!accepted.length) await db.insert(ngoAcceptedCategories).values(["cooked-meals", "bakery-bread", "packaged-food"].map((slug) => ({ ngoId: ngo.id, categoryId: bySlug[slug].id }))).onConflictDoNothing();
    const hours = await db.select().from(ngoOperatingHours).where(eq(ngoOperatingHours.ngoId, ngo.id));
    if (!hours.length) await db.insert(ngoOperatingHours).values(Array.from({ length: 7 }, (_, dayOfWeek) => ({ ngoId: ngo.id, dayOfWeek, opensAt: "09:00", closesAt: "22:00", pickupAvailable: true })));
    await db.update(ngos).set({ storageCapabilities: ["AMBIENT", "HOT_HELD", "CHILLED"] }).where(and(eq(ngos.id, ngo.id), eq(ngos.storageCapabilities, ["AMBIENT"])));
  }

  const ngoIds = allNgos.map((ngo) => ngo.id);
  let counter = 100;
  for (const business of allBusinesses) {
    const history = await db.select({ id: salesHistory.id }).from(salesHistory).where(eq(salesHistory.businessId, business.id)).limit(1);
    const slugs = /bake|bread/i.test(`${business.name} ${business.businessType}`) ? ["bakery-bread", "cooked-meals"] : ["cooked-meals", "bakery-bread"];
    if (!history.length) {
      const base = [34, 18];
      const rows = [];
      for (const [index, slug] of slugs.entries()) {
        for (let day = 60; day >= 1; day -= 1) {
          const date = new Date();
          date.setUTCDate(date.getUTCDate() - day);
          const weekday = date.getUTCDay();
          const prepared = base[index] * (1 + (weekday === 0 || weekday === 6 ? 0.15 : 0) + Math.sin(day * (0.5 + index * 0.1)) * 0.06);
          const leftover = base[index] * (0.13 + Math.cos(day * 0.45) * 0.035);
          const sold = prepared - leftover;
          rows.push({ businessId: business.id, categoryId: bySlug[slug].id, businessDate: date.toISOString().slice(0, 10), preparedKg: Number(prepared.toFixed(1)), soldKg: Number(sold.toFixed(1)), leftoverKg: Number(leftover.toFixed(1)), safeDonationKg: Number(Math.max(0, leftover - 0.5).toFixed(1)), orderCount: Math.round(sold * 2), reservations: weekday === 5 ? 6 : 2, discountPercent: day % 10 === 0 ? 10 : 0, promotionActive: day % 10 === 0, source: "SYNTHETIC" as const });
        }
      }
      await db.insert(salesHistory).values(rows).onConflictDoNothing();
    }

    // Past predictions paired with what actually happened.
    const rows = await db.select().from(salesHistory).where(eq(salesHistory.businessId, business.id));
    for (const row of rows.filter((item) => item.businessDate >= new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10))) {
      const [prediction] = await db.insert(surplusPredictions).values({ businessId: business.id, categoryId: row.categoryId, forecastDate: row.businessDate, predictedPreparedKg: row.preparedKg, predictedDemandKg: Number((row.soldKg * 1.04).toFixed(1)), predictedSurplusKg: Number((row.leftoverKg * 0.95).toFixed(1)), lowerBoundKg: Number((row.leftoverKg * 0.7).toFixed(1)), upperBoundKg: Number((row.leftoverKg * 1.3).toFixed(1)), confidence: 0.68, importantFactors: ["weekday pattern", "recent leftover trend"], isFallback: true, source: "SYNTHETIC" }).onConflictDoNothing().returning({ id: surplusPredictions.id });
      await db.insert(actualSurplus).values({ predictionId: prediction?.id ?? null, businessId: business.id, categoryId: row.categoryId, observationDate: row.businessDate, actualSurplusKg: row.leftoverKg, safeDonationKg: row.safeDonationKg, notes: "Synthetic observation" }).onConflictDoNothing();
    }

    // Past rescue outcomes so history and analytics are populated for every donor.
    const existing = await db.select({ id: donations.id }).from(donations).where(and(eq(donations.businessId, business.id), notInArray(donations.status, ["DRAFT"]))).limit(3);
    if (existing.length < 3 && ngoIds.length) {
      const outcomes = [{ status: "COMPLETED" as const, factor: 1 }, { status: "PARTIALLY_COMPLETED" as const, factor: 0.7 }, { status: "COMPLETED" as const, factor: 1 }, { status: "EXPIRED" as const, factor: 0 }];
      for (const [index, outcome] of outcomes.entries()) {
        counter += 1;
        const publicId = `FR-F${business.id.slice(0, 4).toUpperCase()}${index}`;
        const [exists] = await db.select({ id: donations.id }).from(donations).where(eq(donations.publicId, publicId)).limit(1);
        if (exists) continue;
        const slug = slugs[index % 2];
        const qty = 9 + ((counter * 5) % 16);
        const end = new Date(Date.now() - (index * 4 + 2) * 864e5);
        const start = new Date(end.getTime() - 3 * 36e5);
        const done = Number((qty * outcome.factor).toFixed(1));
        const [donation] = await db.insert(donations).values({ publicId, businessId: business.id, title: `${slug === "bakery-bread" ? "Bakery surplus" : "Cooked meals"} batch ${index + 1}`, description: "Synthetic historical donation for analytics demonstration.", status: outcome.status, urgency: outcome.status === "EXPIRED" ? "EXPIRED" : "NORMAL", totalQuantityKg: qty, reservedQuantityKg: done, completedQuantityKg: done, availableFrom: start, pickupDeadline: end, storageCondition: "AMBIENT", packagingCondition: "PACKED", dietaryTags: ["VEGETARIAN"], safetyReviewed: true, latitude: business.latitude, longitude: business.longitude }).returning();
        await db.insert(donationItems).values({ donationId: donation.id, categoryId: bySlug[slug].id, name: donation.title, quantityKg: qty, dietaryTags: ["VEGETARIAN"] });
        if (done > 0) {
          const ngo = allNgos[(counter + index) % allNgos.length];
          const [offer] = await db.insert(donationOffers).values({ donationId: donation.id, ngoId: ngo.id, offeredQuantityKg: done, status: outcome.status === "COMPLETED" ? "ACCEPTED" : "PARTIAL", matchScore: 62 + ((counter * 7) % 30), recommendationReason: "Synthetic historical offer.", expiresAt: end, respondedAt: start }).returning();
          const [reservation] = await db.insert(reservations).values({ offerId: offer.id, donationId: donation.id, ngoId: ngo.id, quantityKg: done, status: "FULFILLED" }).returning();
          await db.insert(pickupRecords).values({ reservationId: reservation.id, status: "RECEIVED", scheduledAt: start, handoverAt: end, receivedAt: end, handedOverQuantityKg: done });
          const [owner] = await db.select({ ownerId: ngos.ownerId }).from(ngos).where(eq(ngos.id, ngo.id));
          await db.insert(userFeedback).values({ userId: business.ownerId, donationId: donation.id, rating: 4 + (counter % 2), type: "PICKUP_EXPERIENCE", comments: "Synthetic feedback: pickup was on time and the quantity matched." });
          await db.insert(userFeedback).values({ userId: owner.ownerId, donationId: donation.id, rating: 4 + ((counter + 1) % 2), type: "DONOR_EXPERIENCE", comments: "Synthetic feedback: food was packed well and handover was smooth." });
        }
      }
    }
  }

  // Model registry: honest baseline evaluation from synthetic history (no neural result is claimed).
  const [model] = await db.select().from(modelVersions).where(eq(modelVersions.name, "Seasonal-naive fallback")).limit(1)
    .then(async (found) => found.length ? found : db.insert(modelVersions).values({ name: "Seasonal-naive fallback", version: "1.0.0", modelType: "SEASONAL_NAIVE", status: "ACTIVE_RUNTIME", trainingSource: "SYNTHETIC", featureSchema: { features: ["weekday", "prepared_kg", "sold_kg", "leftover_kg"] }, trainingMetadata: { note: "Deterministic median-of-same-weekday baseline; no training." }, trainedAt: new Date() }).returning());
  const evaluated = await db.select({ id: modelEvaluations.id }).from(modelEvaluations).where(eq(modelEvaluations.modelVersionId, model.id)).limit(1);
  if (!evaluated.length) {
    const [green] = await db.select().from(businesses).where(eq(businesses.name, "Green Bowl Kitchen")).limit(1);
    if (green) {
      const history = await db.select().from(salesHistory).where(and(eq(salesHistory.businessId, green.id), eq(salesHistory.categoryId, bySlug["cooked-meals"].id)));
      const points: HistoryPoint[] = history.map((row) => ({ date: row.businessDate, preparedKg: row.preparedKg, soldKg: row.soldKg, leftoverKg: row.leftoverKg, discountPercent: row.discountPercent, promotionActive: row.promotionActive, holidayOrFestival: row.holidayOrFestival }));
      const result = chronologicalEvaluation(points);
      await db.insert(modelEvaluations).values({ modelVersionId: model.id, splitStrategy: "Chronological holdout, final 20%", evaluatedSamples: result.samples, mae: result.mae, rmse: result.rmse, metrics: { note: result.note, source: "synthetic" } });
    }
  }

  // At least a few notifications for every user so the bell is not empty.
  const everyone = await db.select().from(users);
  for (const person of everyone) {
    const [any] = await db.select({ id: notifications.id }).from(notifications).where(eq(notifications.userId, person.id)).limit(1);
    if (any) continue;
    const messages = person.role === "NGO"
      ? [["Welcome to FoodRescue AI", "Set your accepted categories and pickup hours in Profile & settings to start receiving offers."], ["Capacity reminder", "Keep your current capacity up to date so matches stay accurate."]]
      : person.role === "BUSINESS"
        ? [["Welcome to FoodRescue AI", "Your demo history is loaded. Generate a forecast or describe a donation to find recipients."], ["Tip", "Review handling and packaging, then publish so recipients can be matched."]]
        : [["Admin console ready", "Review pending organizations and the audit trail from the Admin page."]];
    await db.insert(notifications).values(messages.map(([title, message]) => ({ userId: person.id, type: "SYSTEM", title, message, actionUrl: person.role === "ADMIN" ? "/admin" : "/settings", status: "DELIVERED" as const, metadata: { synthetic: true } })));
  }
  console.log("Fill seed complete: every organization now has history, outcomes, feedback and notifications.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => pool.end());
