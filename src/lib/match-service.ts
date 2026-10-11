import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { donationItems, donations, foodCategories, ngoAcceptedCategories, ngoOperatingHours, ngos } from "@/db/schema";
import { ApiError } from "@/lib/http";
import { defaultWeights, rankNgoMatches, type NgoForMatch, type ScoreWeights } from "@/lib/matching";

export async function getDonationMatches(donationId: string, weights: ScoreWeights = defaultWeights) {
  const [donation] = await db.select({
    id: donations.id,
    quantityKg: donations.totalQuantityKg,
    reservedQuantityKg: donations.reservedQuantityKg,
    description: donations.description,
    dietaryTags: donations.dietaryTags,
    storageCondition: donations.storageCondition,
    latitude: donations.latitude,
    longitude: donations.longitude,
    availableFrom: donations.availableFrom,
    pickupDeadline: donations.pickupDeadline,
    safetyReviewed: donations.safetyReviewed,
    status: donations.status,
    categoryId: donationItems.categoryId,
    categoryName: foodCategories.name,
  }).from(donations).innerJoin(donationItems, eq(donationItems.donationId, donations.id)).innerJoin(foodCategories, eq(foodCategories.id, donationItems.categoryId)).where(eq(donations.id, donationId)).limit(1);
  if (!donation) throw new ApiError("Donation not found", 404);
  const acceptedRows = await db.select({ ngoId: ngoAcceptedCategories.ngoId, categoryId: foodCategories.id, categoryName: foodCategories.name }).from(ngoAcceptedCategories).innerJoin(foodCategories, eq(foodCategories.id, ngoAcceptedCategories.categoryId));
  const ngoRows = await db.select().from(ngos);
  const day = new Date(Date.now() + 330 * 60_000).getUTCDay();
  const hours = await db.select().from(ngoOperatingHours).where(eq(ngoOperatingHours.dayOfWeek, day));
  const candidates: NgoForMatch[] = ngoRows.map((ngo) => {
    const accepted = acceptedRows.filter((row) => row.ngoId === ngo.id);
    const todayHours = hours.find((item) => item.ngoId === ngo.id && item.pickupAvailable);
    return {
      id: ngo.id,
      name: ngo.name,
      acceptedCategoryIds: accepted.map((item) => item.categoryId),
      acceptedCategoryNames: accepted.map((item) => item.categoryName),
      requirementsText: ngo.requirementsText ?? "",
      dietaryPreferences: ngo.dietaryPreferences,
      storageCapabilities: ngo.storageCapabilities,
      currentCapacityKg: ngo.currentCapacityKg,
      maxTravelDistanceKm: ngo.maxTravelDistanceKm,
      hasTransport: ngo.hasTransport,
      acceptsPartial: ngo.acceptsPartial,
      verificationStatus: ngo.verificationStatus,
      latitude: ngo.latitude,
      longitude: ngo.longitude,
      pickupWindowStart: todayHours?.opensAt?.slice(0, 5) ?? "00:00",
      pickupWindowEnd: todayHours?.closesAt?.slice(0, 5) ?? "00:00",
    };
  });
  const remainingQuantityKg = Math.max(0, donation.quantityKg - donation.reservedQuantityKg);
  const matches = rankNgoMatches({
    quantityKg: remainingQuantityKg,
    categoryId: donation.categoryId,
    categoryName: donation.categoryName,
    description: donation.description,
    dietaryTags: donation.dietaryTags,
    storageCondition: donation.storageCondition,
    latitude: donation.latitude,
    longitude: donation.longitude,
    availableFrom: donation.availableFrom,
    pickupDeadline: donation.pickupDeadline,
    safetyReviewed: donation.safetyReviewed,
  }, candidates, weights);
  return { donation, remainingQuantityKg, matches };
}
