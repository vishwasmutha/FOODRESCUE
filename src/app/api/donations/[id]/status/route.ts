import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { businesses, donationOffers, donations, ngos, notifications, pickupRecords, reservations } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { apiErrorResponse, ApiError, readJson, requireNumber, requireText, writeAudit } from "@/lib/http";
import { classifyUrgency } from "@/lib/safety";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(["BUSINESS", "NGO", "ADMIN"]);
    const { id } = await params;
    const body = await readJson<Record<string, unknown>>(request);
    const action = requireText(body.action, "Action", 3, 40).toUpperCase();
    const [donationRecord] = await db.select({ donation: donations, ownerId: businesses.ownerId }).from(donations).innerJoin(businesses, eq(businesses.id, donations.businessId)).where(eq(donations.id, id)).limit(1);
    if (!donationRecord) throw new ApiError("Donation not found", 404);
    const [ngo] = user.role === "NGO" ? await db.select().from(ngos).where(eq(ngos.ownerId, user.id)).limit(1) : [null];
    if (user.role === "BUSINESS" && donationRecord.ownerId !== user.id) throw new ApiError("Donation not found", 404);
    if (action === "START_PICKUP") {
      const reservationId = requireText(body.reservationId, "Reservation", 36, 36);
      const [reservation] = await db.select().from(reservations).where(and(eq(reservations.id, reservationId), eq(reservations.donationId, id))).limit(1);
      if (!reservation || reservation.status !== "ACTIVE" || (user.role === "NGO" && reservation.ngoId !== ngo?.id)) throw new ApiError("Active reservation not found", 404);
      await db.transaction(async (tx) => {
        await tx.update(pickupRecords).set({ status: "IN_PROGRESS", updatedAt: new Date() }).where(eq(pickupRecords.reservationId, reservationId));
        await tx.update(donations).set({ status: "PICKUP_IN_PROGRESS", updatedAt: new Date(), version: sql`${donations.version} + 1` }).where(eq(donations.id, id));
      });
      await writeAudit({ actorId: user.id, action: "PICKUP_STARTED", entityType: "DONATION", entityId: id, details: { reservationId } });
      return Response.json({ status: "PICKUP_IN_PROGRESS" });
    }
    if (action === "COMPLETE") {
      if (user.role === "BUSINESS") throw new ApiError("Recipient confirmation is required to complete delivery", 403);
      const reservationId = requireText(body.reservationId, "Reservation", 36, 36);
      const result = await db.transaction(async (tx) => {
        await tx.execute(sql`select id from ${donations} where id = ${id} for update`);
        const [reservation] = await tx.select().from(reservations).where(and(eq(reservations.id, reservationId), eq(reservations.donationId, id))).limit(1);
        if (!reservation || reservation.status !== "ACTIVE" || (user.role === "NGO" && reservation.ngoId !== ngo?.id)) throw new ApiError("Active reservation not found", 404);
        const quantityKg = body.quantityKg == null ? reservation.quantityKg : requireNumber(body.quantityKg, "Received quantity", 0.1, reservation.quantityKg);
        await tx.update(pickupRecords).set({ status: "RECEIVED", handoverAt: new Date(), receivedAt: new Date(), handedOverQuantityKg: quantityKg, notes: typeof body.notes === "string" ? body.notes.slice(0, 2000) : null, updatedAt: new Date() }).where(eq(pickupRecords.reservationId, reservationId));
        await tx.update(reservations).set({ status: "FULFILLED", updatedAt: new Date() }).where(eq(reservations.id, reservationId));
        const newCompleted = donationRecord.donation.completedQuantityKg + quantityKg;
        const finalStatus = newCompleted >= donationRecord.donation.totalQuantityKg - 0.001 ? "COMPLETED" : "PARTIALLY_COMPLETED";
        await tx.update(donations).set({ completedQuantityKg: sql`${donations.completedQuantityKg} + ${quantityKg}`, status: finalStatus, updatedAt: new Date(), version: sql`${donations.version} + 1` }).where(eq(donations.id, id));
        return { quantityKg, finalStatus };
      });
      await writeAudit({ actorId: user.id, action: "DONATION_COMPLETED", entityType: "DONATION", entityId: id, details: { reservationId, quantityKg: result.quantityKg } });
      return Response.json(result);
    }
    if (action === "CANCEL") {
      if (user.role !== "BUSINESS" && user.role !== "ADMIN") throw new ApiError("Only the donor or an administrator can cancel", 403);
      if (["COMPLETED", "CANCELLED"].includes(donationRecord.donation.status)) throw new ApiError("Donation cannot be cancelled in its current state", 409);
      await db.transaction(async (tx) => {
        const active = await tx.select().from(reservations).where(and(eq(reservations.donationId, id), eq(reservations.status, "ACTIVE")));
        for (const reservation of active) {
          await tx.update(ngos).set({ currentCapacityKg: sql`least(${ngos.maxCapacityKg}, ${ngos.currentCapacityKg} + ${reservation.quantityKg})`, updatedAt: new Date() }).where(eq(ngos.id, reservation.ngoId));
          await tx.update(pickupRecords).set({ status: "CANCELLED", updatedAt: new Date() }).where(eq(pickupRecords.reservationId, reservation.id));
        }
        await tx.update(reservations).set({ status: "RELEASED", updatedAt: new Date() }).where(and(eq(reservations.donationId, id), eq(reservations.status, "ACTIVE")));
        await tx.update(donationOffers).set({ status: "CANCELLED" }).where(eq(donationOffers.donationId, id));
        await tx.update(donations).set({ status: "CANCELLED", reservedQuantityKg: 0, updatedAt: new Date(), version: sql`${donations.version} + 1` }).where(eq(donations.id, id));
      });
      await writeAudit({ actorId: user.id, action: "DONATION_CANCELLED", entityType: "DONATION", entityId: id });
      return Response.json({ status: "CANCELLED" });
    }
    if (action === "REVIEW_AND_PUBLISH") {
      if (user.role !== "BUSINESS" && user.role !== "ADMIN") throw new ApiError("Only the donor or an administrator can review a listing", 403);
      const current = donationRecord.donation;
      if (!["DRAFT", "AVAILABLE"].includes(current.status)) throw new ApiError("Only draft or available donations can be reviewed", 409);
      const safety = classifyUrgency({ pickupDeadline: current.pickupDeadline, storageCondition: current.storageCondition, packagingCondition: current.packagingCondition, safetyReviewed: true });
      if (!safety.acceptingAllowed) throw new ApiError(safety.reasons.join(" "), 409);
      const [business] = await db.select().from(businesses).where(eq(businesses.id, current.businessId)).limit(1);
      await db.update(donations).set({ safetyReviewed: true, status: "AVAILABLE", urgency: safety.urgency, latitude: current.latitude ?? business?.latitude ?? null, longitude: current.longitude ?? business?.longitude ?? null, updatedAt: new Date(), version: sql`${donations.version} + 1` }).where(eq(donations.id, id));
      await writeAudit({ actorId: user.id, action: "DONATION_REVIEWED_PUBLISHED", entityType: "DONATION", entityId: id, details: { urgency: safety.urgency } });
      return Response.json({ status: "AVAILABLE", urgency: safety.urgency });
    }
    throw new ApiError("Unsupported status action");
  } catch (error) {
    return apiErrorResponse(error);
  }
}
