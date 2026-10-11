import { eq } from "drizzle-orm";
import { db } from "@/db";
import { businesses, donationOffers, donations, ngos, notifications } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getDonationMatches } from "@/lib/match-service";
import { apiErrorResponse, ApiError, readJson, writeAudit } from "@/lib/http";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(["BUSINESS"]);
    const { id } = await params;
    const body = await readJson<Record<string, unknown>>(request);
    const ngoIds = Array.isArray(body.ngoIds) ? [...new Set(body.ngoIds.filter((value): value is string => typeof value === "string"))] : [];
    if (!ngoIds.length || ngoIds.length > 10) throw new ApiError("Select between 1 and 10 recipients");
    const [record] = await db.select({ donation: donations, ownerId: businesses.ownerId }).from(donations).innerJoin(businesses, eq(businesses.id, donations.businessId)).where(eq(donations.id, id)).limit(1);
    if (!record || record.ownerId !== user.id) throw new ApiError("Donation not found", 404);
    if (!["AVAILABLE", "OFFERED", "ACCEPTED"].includes(record.donation.status)) throw new ApiError("Donation is not available for offers", 409);
    const existingOffers = await db.select({ ngoId: donationOffers.ngoId }).from(donationOffers).where(eq(donationOffers.donationId, id));
    const alreadyOffered = ngoIds.filter((ngoId) => existingOffers.some((offer) => offer.ngoId === ngoId));
    if (alreadyOffered.length) throw new ApiError("An offer has already been sent to one or more selected recipients", 409, { ngoIds: alreadyOffered });
    const matching = await getDonationMatches(id);
    if (matching.remainingQuantityKg <= 0) throw new ApiError("No unreserved quantity remains", 409);
    const selected = matching.matches.filter((match) => ngoIds.includes(match.ngoId));
    const rejected = selected.filter((match) => !match.eligible);
    if (selected.length !== ngoIds.length) throw new ApiError("One or more recipients were not found", 404);
    if (rejected.length) throw new ApiError("One or more recipients no longer meet hard eligibility rules", 409, rejected.map((match) => ({ ngoId: match.ngoId, reasons: match.rejectionReasons })));
    const expiresAt = new Date(Math.min(record.donation.pickupDeadline.getTime(), Date.now() + 90 * 60_000));
    await db.transaction(async (tx) => {
      for (const match of selected) {
        const offeredQuantityKg = Math.min(match.eligibleQuantityKg, matching.remainingQuantityKg);
        const [createdOffer] = await tx.insert(donationOffers).values({ donationId: id, ngoId: match.ngoId, offeredQuantityKg, matchScore: match.score, scoreBreakdown: match.scoreBreakdown, recommendationReason: match.reasons.join(" "), expiresAt }).onConflictDoNothing().returning({ id: donationOffers.id });
        if (!createdOffer) throw new ApiError("An offer has already been sent to one or more selected recipients", 409, { ngoId: match.ngoId });
        const [recipient] = await tx.select({ ownerId: ngos.ownerId }).from(ngos).where(eq(ngos.id, match.ngoId)).limit(1);
        if (recipient) await tx.insert(notifications).values({ userId: recipient.ownerId, type: "DONATION_OFFER", title: `New ${record.donation.urgency === "URGENT" ? "urgent " : ""}donation offer`, message: `${record.donation.title}: up to ${offeredQuantityKg.toFixed(1)} kg is available.`, actionUrl: `/donations/${id}`, metadata: { donationId: id, syntheticDistance: true } });
      }
      await tx.update(donations).set({ status: "OFFERED", updatedAt: new Date(), version: record.donation.version + 1 }).where(eq(donations.id, id));
    });
    await writeAudit({ actorId: user.id, action: "DONATION_OFFERS_SENT", entityType: "DONATION", entityId: id, details: { ngoIds, expiresAt: expiresAt.toISOString() } });
    return Response.json({ sent: selected.length, expiresAt }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
