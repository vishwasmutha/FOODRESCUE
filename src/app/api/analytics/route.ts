import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { businesses, donations, ngos, reservations, surplusPredictions, systemSettings } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { apiErrorResponse, ApiError } from "@/lib/http";

export async function GET() {
  try {
    const user = await requireUser();
    let donationRows: Array<typeof donations.$inferSelect>;
    if (user.role === "BUSINESS") {
      const [business] = await db.select().from(businesses).where(eq(businesses.ownerId, user.id)).limit(1);
      if (!business) throw new ApiError("Business profile not found", 404);
      donationRows = await db.select().from(donations).where(eq(donations.businessId, business.id)).orderBy(asc(donations.createdAt));
    } else if (user.role === "NGO") {
      const [ngo] = await db.select().from(ngos).where(eq(ngos.ownerId, user.id)).limit(1);
      if (!ngo) throw new ApiError("NGO profile not found", 404);
      const reservationRows = await db.select({ donation: donations }).from(reservations).innerJoin(donations, eq(donations.id, reservations.donationId)).where(eq(reservations.ngoId, ngo.id));
      donationRows = reservationRows.map((row) => row.donation);
    } else {
      donationRows = await db.select().from(donations).orderBy(asc(donations.createdAt));
    }
    const [assumptionSetting] = await db.select().from(systemSettings).where(eq(systemSettings.key, "impact_assumptions")).limit(1);
    const assumptions = (assumptionSetting?.value ?? { kgPerEstimatedMeal: 0.4, co2eKgPerFoodKg: 2.5 }) as { kgPerEstimatedMeal: number; co2eKgPerFoodKg: number };
    const offeredKg = donationRows.filter((item) => item.status !== "DRAFT" && item.status !== "PREDICTED").reduce((sum, item) => sum + item.totalQuantityKg, 0);
    const acceptedKg = donationRows.reduce((sum, item) => sum + item.reservedQuantityKg, 0);
    const rescuedKg = donationRows.reduce((sum, item) => sum + item.completedQuantityKg, 0);
    const closed = donationRows.filter((item) => ["COMPLETED", "PARTIALLY_COMPLETED", "EXPIRED", "FAILED_PICKUP", "CANCELLED"].includes(item.status));
    const closedOfferedKg = closed.reduce((sum, item) => sum + item.totalQuantityKg, 0);
    const closedRescuedKg = closed.reduce((sum, item) => sum + item.completedQuantityKg, 0);
    const predictions = user.role === "BUSINESS" ? await db.select().from(surplusPredictions) : [];
    return Response.json({
      quantities: { predictedKg: predictions.reduce((sum, item) => sum + item.predictedSurplusKg, 0), offeredKg: Math.round(offeredKg * 10) / 10, acceptedKg: Math.round(acceptedKg * 10) / 10, rescuedKg: Math.round(rescuedKg * 10) / 10, notRescuedClosedKg: Math.round(Math.max(0, closedOfferedKg - closedRescuedKg) * 10) / 10 },
      rescueCompletionRate: closedOfferedKg > 0 ? Math.round((closedRescuedKg / closedOfferedKg) * 1000) / 10 : null,
      estimates: { meals: Math.round(rescuedKg / assumptions.kgPerEstimatedMeal), avoidedCo2eKg: Math.round(rescuedKg * assumptions.co2eKgPerFoodKg), assumptions, label: "Estimates based on configurable demo assumptions; not measured outcomes." },
      trend: donationRows.map((item) => ({ date: item.createdAt.toISOString().slice(0, 10), offeredKg: item.totalQuantityKg, rescuedKg: item.completedQuantityKg, status: item.status })),
      definitions: { rescued: "Quantity with recorded recipient completion, not predictions or acceptances.", rescueCompletionRate: "Completed rescued kg divided by offered kg for closed donations only." },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
