import { randomBytes } from "node:crypto";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { businesses, donationItems, donations, foodCategories, ngos } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { apiErrorResponse, ApiError, pagination, readJson, requireNumber, requireText, writeAudit } from "@/lib/http";
import { classifyUrgency } from "@/lib/safety";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const { page, pageSize, offset } = pagination(request.url);
    let businessId: string | null = null;
    if (user.role === "BUSINESS") {
      const [business] = await db.select({ id: businesses.id }).from(businesses).where(eq(businesses.ownerId, user.id)).limit(1);
      if (!business) throw new ApiError("Business profile not found", 404);
      businessId = business.id;
    }
    if (user.role === "NGO") {
      const [ngo] = await db.select({ id: ngos.id }).from(ngos).where(eq(ngos.ownerId, user.id)).limit(1);
      if (!ngo) throw new ApiError("NGO profile not found", 404);
    }
    const visibleStatuses = ["AVAILABLE", "OFFERED", "ACCEPTED", "PICKUP_IN_PROGRESS", "COMPLETED", "PARTIALLY_COMPLETED"] as const;
    const data = await db.select({ id: donations.id, publicId: donations.publicId, title: donations.title, description: donations.description, status: donations.status, urgency: donations.urgency, totalQuantityKg: donations.totalQuantityKg, reservedQuantityKg: donations.reservedQuantityKg, completedQuantityKg: donations.completedQuantityKg, pickupDeadline: donations.pickupDeadline, createdAt: donations.createdAt, businessName: businesses.name }).from(donations).innerJoin(businesses, eq(businesses.id, donations.businessId)).where(businessId ? eq(donations.businessId, businessId) : user.role === "NGO" ? inArray(donations.status, visibleStatuses) : undefined).orderBy(desc(donations.createdAt)).limit(pageSize).offset(offset);
    return Response.json({ data, pagination: { page, pageSize } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser(["BUSINESS"]);
    const [business] = await db.select().from(businesses).where(eq(businesses.ownerId, user.id)).limit(1);
    if (!business) throw new ApiError("Business profile not found", 404);
    if (business.verificationStatus === "SUSPENDED") throw new ApiError("Suspended businesses cannot publish donations", 403);
    const body = await readJson<Record<string, unknown>>(request);
    const title = requireText(body.title, "Title", 3, 180);
    const description = requireText(body.description, "Description", 10, 5000);
    const categoryId = requireText(body.categoryId, "Food category", 36, 36);
    const [category] = await db.select().from(foodCategories).where(eq(foodCategories.id, categoryId)).limit(1);
    if (!category || !category.isActive) throw new ApiError("Select an active food category");
    const totalQuantityKg = requireNumber(body.quantityKg, "Quantity", 0.1, 10_000);
    const availableFrom = new Date(requireText(body.availableFrom, "Availability time", 10, 50));
    const pickupDeadline = new Date(requireText(body.pickupDeadline, "Pickup deadline", 10, 50));
    if (Number.isNaN(availableFrom.getTime()) || Number.isNaN(pickupDeadline.getTime())) throw new ApiError("Availability and deadline must be valid dates");
    if (pickupDeadline <= availableFrom) throw new ApiError("Pickup deadline must be after availability time");
    if (pickupDeadline <= new Date()) throw new ApiError("Pickup deadline must be in the future");
    const storageCondition = typeof body.storageCondition === "string" && body.storageCondition ? body.storageCondition.slice(0, 80) : null;
    const packagingCondition = typeof body.packagingCondition === "string" && body.packagingCondition ? body.packagingCondition.slice(0, 100) : null;
    const safetyReviewed = body.safetyReviewed === true;
    const safety = classifyUrgency({ pickupDeadline, storageCondition, packagingCondition, safetyReviewed });
    const publish = body.publish === true;
    const status = publish && safety.acceptingAllowed ? "AVAILABLE" as const : "DRAFT" as const;
    const publicId = `FR-${new Date().getUTCFullYear().toString().slice(-2)}${String(new Date().getUTCMonth() + 1).padStart(2, "0")}-${randomBytes(3).toString("hex").toUpperCase()}`;
    const dietaryTags = Array.isArray(body.dietaryTags) ? body.dietaryTags.filter((tag): tag is string => typeof tag === "string").slice(0, 10) : [];
    const [created] = await db.transaction(async (tx) => {
      const rows = await tx.insert(donations).values({ publicId, businessId: business.id, title, description, extractedData: typeof body.extraction === "object" && body.extraction ? body.extraction : {}, status, urgency: safety.urgency, totalQuantityKg, availableFrom, pickupDeadline, preparationTime: typeof body.preparationTime === "string" ? new Date(body.preparationTime) : null, storageCondition, packagingCondition, dietaryTags, safetyReviewed, safetyNotes: typeof body.safetyNotes === "string" ? body.safetyNotes.slice(0, 2000) : null, latitude: business.latitude, longitude: business.longitude }).returning();
      await tx.insert(donationItems).values({ donationId: rows[0].id, categoryId, name: typeof body.foodName === "string" ? body.foodName.slice(0, 180) : title, quantityKg: totalQuantityKg, dietaryTags, allergenNotes: typeof body.allergenNotes === "string" ? body.allergenNotes.slice(0, 1000) : null });
      return rows;
    });
    await writeAudit({ actorId: user.id, action: status === "AVAILABLE" ? "DONATION_PUBLISHED" : "DONATION_DRAFTED", entityType: "DONATION", entityId: created.id, details: { quantityKg: totalQuantityKg, safety: safety.reasons } });
    return Response.json({ donation: created, safety, message: status === "DRAFT" && publish ? "Saved as draft because safety review is incomplete." : "Donation saved." }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
