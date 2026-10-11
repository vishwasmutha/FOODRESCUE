import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { businesses, foodCategories, salesHistory } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { apiErrorResponse, ApiError, pagination, readJson, requireNumber, requireText, writeAudit } from "@/lib/http";

async function ownedBusiness(userId: string) {
  const [business] = await db.select().from(businesses).where(eq(businesses.ownerId, userId)).limit(1);
  if (!business) throw new ApiError("Business profile not found", 404);
  return business;
}

export async function GET(request: Request) {
  try {
    const user = await requireUser(["BUSINESS", "ADMIN"]);
    const business = user.role === "BUSINESS" ? await ownedBusiness(user.id) : null;
    const { page, pageSize, offset } = pagination(request.url);
    const rows = await db.select({ id: salesHistory.id, date: salesHistory.businessDate, category: foodCategories.name, categoryId: foodCategories.id, preparedKg: salesHistory.preparedKg, soldKg: salesHistory.soldKg, leftoverKg: salesHistory.leftoverKg, safeDonationKg: salesHistory.safeDonationKg, source: salesHistory.source }).from(salesHistory).innerJoin(foodCategories, eq(foodCategories.id, salesHistory.categoryId)).where(business ? eq(salesHistory.businessId, business.id) : undefined).orderBy(desc(salesHistory.businessDate)).limit(pageSize).offset(offset);
    return Response.json({ data: rows, pagination: { page, pageSize } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser(["BUSINESS"]);
    const business = await ownedBusiness(user.id);
    const body = await readJson<Record<string, unknown>>(request);
    const records = Array.isArray(body.records) ? body.records : [body];
    if (!records.length || records.length > 500) throw new ApiError("Submit between 1 and 500 records");
    const categoryIds = records.map((record) => requireText((record as Record<string, unknown>).categoryId, "Category", 36, 36));
    const validCategories = await db.select({ id: foodCategories.id }).from(foodCategories).where(inArray(foodCategories.id, categoryIds));
    if (new Set(validCategories.map((item) => item.id)).size !== new Set(categoryIds).size) throw new ApiError("One or more food categories are invalid");
    const values = records.map((raw) => {
      const record = raw as Record<string, unknown>;
      const businessDate = requireText(record.date, "Date", 10, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(businessDate) || Number.isNaN(Date.parse(businessDate))) throw new ApiError(`Invalid date: ${businessDate}`);
      const preparedKg = requireNumber(record.preparedKg, "Prepared quantity", 0, 10_000);
      const soldKg = requireNumber(record.soldKg, "Sold quantity", 0, preparedKg);
      const leftoverKg = requireNumber(record.leftoverKg ?? preparedKg - soldKg, "Leftover quantity", 0, preparedKg);
      return { businessId: business.id, categoryId: String(record.categoryId), businessDate, preparedKg, soldKg, leftoverKg, safeDonationKg: record.safeDonationKg == null ? null : requireNumber(record.safeDonationKg, "Safe donation quantity", 0, leftoverKg), orderCount: record.orderCount == null ? null : Math.round(requireNumber(record.orderCount, "Order count", 0, 1_000_000)), discountPercent: requireNumber(record.discountPercent ?? 0, "Discount", 0, 100), promotionActive: Boolean(record.promotionActive), holidayOrFestival: typeof record.holidayOrFestival === "string" ? record.holidayOrFestival.slice(0, 100) : null, source: records.length > 1 ? "CSV_IMPORT" as const : "USER_ENTERED" as const };
    });
    await db.transaction(async (tx) => {
      for (const value of values) {
        await tx.insert(salesHistory).values(value).onConflictDoUpdate({ target: [salesHistory.businessId, salesHistory.categoryId, salesHistory.businessDate], set: { preparedKg: value.preparedKg, soldKg: value.soldKg, leftoverKg: value.leftoverKg, safeDonationKg: value.safeDonationKg, orderCount: value.orderCount, discountPercent: value.discountPercent, promotionActive: value.promotionActive, holidayOrFestival: value.holidayOrFestival, source: value.source } });
      }
    });
    await writeAudit({ actorId: user.id, action: "SALES_HISTORY_IMPORTED", entityType: "BUSINESS", entityId: business.id, details: { records: values.length } });
    return Response.json({ inserted: values.length }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
