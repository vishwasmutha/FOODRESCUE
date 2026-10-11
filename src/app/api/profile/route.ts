import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { businesses, foodCategories, ngoAcceptedCategories, ngoOperatingHours, ngos, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { apiErrorResponse, ApiError, readJson, requireNumber, requireText, writeAudit } from "@/lib/http";

export async function GET() {
  try {
    const user = await requireUser();
    const [account] = await db.select({ id: users.id, name: users.name, email: users.email, phone: users.phone, role: users.role, timezone: users.timezone, locale: users.locale, notificationPreferences: users.notificationPreferences }).from(users).where(eq(users.id, user.id)).limit(1);
    const organization = user.role === "BUSINESS" ? (await db.select().from(businesses).where(eq(businesses.ownerId, user.id)).limit(1))[0] : user.role === "NGO" ? (await db.select().from(ngos).where(eq(ngos.ownerId, user.id)).limit(1))[0] : null;
    let requirements = null;
    if (user.role === "NGO" && organization) {
      const acceptedCategories = await db.select({ id: foodCategories.id, name: foodCategories.name }).from(ngoAcceptedCategories).innerJoin(foodCategories, eq(foodCategories.id, ngoAcceptedCategories.categoryId)).where(eq(ngoAcceptedCategories.ngoId, organization.id));
      const operatingHours = await db.select().from(ngoOperatingHours).where(eq(ngoOperatingHours.ngoId, organization.id));
      requirements = { acceptedCategories, operatingHours };
    }
    return Response.json({ account, organization, requirements });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    const body = await readJson<Record<string, unknown>>(request);
    if (typeof body.name === "string") await db.update(users).set({ name: requireText(body.name, "Name", 2, 160), updatedAt: new Date() }).where(eq(users.id, user.id));
    if (user.role === "BUSINESS") {
      const [organization] = await db.update(businesses).set({ description: typeof body.description === "string" ? body.description.slice(0, 5000) : undefined, address: typeof body.address === "string" ? requireText(body.address, "Address", 5, 1000) : undefined, defaultPickupNotes: typeof body.defaultPickupNotes === "string" ? body.defaultPickupNotes.slice(0, 2000) : undefined, updatedAt: new Date() }).where(eq(businesses.ownerId, user.id)).returning();
      if (!organization) throw new ApiError("Business profile not found", 404);
    } else if (user.role === "NGO") {
      const capacity = body.maxCapacityKg == null ? undefined : requireNumber(body.maxCapacityKg, "Maximum capacity", 0.1, 10_000);
      const current = body.currentCapacityKg == null ? undefined : requireNumber(body.currentCapacityKg, "Current capacity", 0, capacity ?? 10_000);
      const [organization] = await db.update(ngos).set({ requirementsText: typeof body.requirementsText === "string" ? body.requirementsText.slice(0, 5000) : undefined, address: typeof body.address === "string" ? requireText(body.address, "Address", 5, 1000) : undefined, maxCapacityKg: capacity, currentCapacityKg: current, maxTravelDistanceKm: body.maxTravelDistanceKm == null ? undefined : requireNumber(body.maxTravelDistanceKm, "Maximum travel distance", 1, 500), hasTransport: typeof body.hasTransport === "boolean" ? body.hasTransport : undefined, acceptsPartial: typeof body.acceptsPartial === "boolean" ? body.acceptsPartial : undefined, updatedAt: new Date() }).where(eq(ngos.ownerId, user.id)).returning();
      if (!organization) throw new ApiError("NGO profile not found", 404);
      if (Array.isArray(body.acceptedCategoryIds)) {
        const categoryIds = [...new Set(body.acceptedCategoryIds.filter((value): value is string => typeof value === "string"))];
        if (!categoryIds.length) throw new ApiError("Select at least one accepted category");
        const valid = await db.select({ id: foodCategories.id }).from(foodCategories).where(inArray(foodCategories.id, categoryIds));
        if (valid.length !== categoryIds.length) throw new ApiError("One or more accepted categories are invalid");
        await db.transaction(async (tx) => {
          await tx.delete(ngoAcceptedCategories).where(eq(ngoAcceptedCategories.ngoId, organization.id));
          await tx.insert(ngoAcceptedCategories).values(categoryIds.map((categoryId) => ({ ngoId: organization.id, categoryId })));
        });
      }
      if (typeof body.pickupStart === "string" && typeof body.pickupEnd === "string") {
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(body.pickupStart) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(body.pickupEnd) || body.pickupEnd <= body.pickupStart) throw new ApiError("Provide a valid pickup window with end after start");
        await db.transaction(async (tx) => {
          await tx.delete(ngoOperatingHours).where(eq(ngoOperatingHours.ngoId, organization.id));
          await tx.insert(ngoOperatingHours).values(Array.from({ length: 7 }, (_, dayOfWeek) => ({ ngoId: organization.id, dayOfWeek, opensAt: body.pickupStart as string, closesAt: body.pickupEnd as string, pickupAvailable: true })));
        });
      }
    }
    await writeAudit({ actorId: user.id, action: "PROFILE_UPDATED", entityType: user.role, entityId: user.id });
    return GET();
  } catch (error) {
    return apiErrorResponse(error);
  }
}
