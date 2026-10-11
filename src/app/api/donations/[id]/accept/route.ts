import { randomBytes } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { businesses, donationOffers, donations, ngos, notifications, offerResponses, pickupRecords, reservations } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { apiErrorResponse, ApiError, readJson, requireNumber, requireText, writeAudit } from "@/lib/http";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(["NGO"]);
    const { id } = await params;
    const body = await readJson<Record<string, unknown>>(request);
    const offerId = requireText(body.offerId, "Offer", 36, 36);
    const [ngo] = await db.select().from(ngos).where(eq(ngos.ownerId, user.id)).limit(1);
    if (!ngo || ngo.verificationStatus !== "VERIFIED") throw new ApiError("A verified NGO profile is required", 403);
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select id from ${donations} where id = ${id} for update`);
      await tx.execute(sql`select id from ${ngos} where id = ${ngo.id} for update`);
      const [donation] = await tx.select().from(donations).where(eq(donations.id, id)).limit(1);
      const [offer] = await tx.select().from(donationOffers).where(and(eq(donationOffers.id, offerId), eq(donationOffers.donationId, id), eq(donationOffers.ngoId, ngo.id))).limit(1);
      if (!donation || !offer) throw new ApiError("Offer not found", 404);
      if (offer.status !== "PENDING") throw new ApiError("Offer has already been answered", 409);
      if (offer.expiresAt <= new Date() || donation.pickupDeadline <= new Date()) throw new ApiError("Offer or pickup window has expired", 409);
      if (!donation.safetyReviewed || !["AVAILABLE", "OFFERED", "ACCEPTED"].includes(donation.status)) throw new ApiError("Donation is not eligible for acceptance", 409);
      const remaining = donation.totalQuantityKg - donation.reservedQuantityKg;
      const requested = body.quantityKg == null ? Math.min(offer.offeredQuantityKg, remaining, ngo.currentCapacityKg) : requireNumber(body.quantityKg, "Accepted quantity", 0.1, offer.offeredQuantityKg);
      const quantityKg = Math.min(requested, remaining, ngo.currentCapacityKg);
      if (quantityKg <= 0 || quantityKg + 0.0001 < requested) throw new ApiError("Requested quantity exceeds current donation or recipient capacity", 409);
      const [reservation] = await tx.insert(reservations).values({ offerId: offer.id, donationId: id, ngoId: ngo.id, quantityKg, status: "ACTIVE", expiresAt: donation.pickupDeadline }).returning();
      await tx.update(donationOffers).set({ status: quantityKg < offer.offeredQuantityKg ? "PARTIAL" : "ACCEPTED", respondedAt: new Date() }).where(eq(donationOffers.id, offer.id));
      await tx.insert(offerResponses).values({ offerId: offer.id, responderId: user.id, action: quantityKg < offer.offeredQuantityKg ? "REQUEST_PARTIAL_ACCEPTED" : "ACCEPTED", requestedQuantityKg: quantityKg, message: typeof body.message === "string" ? body.message.slice(0, 1000) : null });
      await tx.update(donations).set({ reservedQuantityKg: sql`${donations.reservedQuantityKg} + ${quantityKg}`, status: "ACCEPTED", version: sql`${donations.version} + 1`, updatedAt: new Date() }).where(eq(donations.id, id));
      await tx.update(ngos).set({ currentCapacityKg: sql`${ngos.currentCapacityKg} - ${quantityKg}`, updatedAt: new Date() }).where(eq(ngos.id, ngo.id));
      const [pickup] = await tx.insert(pickupRecords).values({ reservationId: reservation.id, status: "SCHEDULED", scheduledAt: donation.availableFrom, donorConfirmationCode: randomBytes(3).toString("hex").toUpperCase(), recipientConfirmationCode: randomBytes(3).toString("hex").toUpperCase() }).returning();
      const [business] = await tx.select({ ownerId: businesses.ownerId }).from(businesses).where(eq(businesses.id, donation.businessId)).limit(1);
      if (business) await tx.insert(notifications).values({ userId: business.ownerId, type: "OFFER_ACCEPTED", title: `${ngo.name} accepted your donation`, message: `${quantityKg.toFixed(1)} kg has been reserved for pickup.`, actionUrl: `/donations/${id}`, metadata: { donationId: id, reservationId: reservation.id } });
      return { reservation, pickup, quantityKg };
    });
    await writeAudit({ actorId: user.id, action: "DONATION_ACCEPTED", entityType: "DONATION", entityId: id, details: { offerId, quantityKg: result.quantityKg, reservationId: result.reservation.id } });
    return Response.json(result, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
