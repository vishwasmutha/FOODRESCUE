import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { businesses, foodCategories, salesHistory, surplusPredictions } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { chronologicalEvaluation, generateForecast, type HistoryPoint } from "@/lib/forecasting";
import { apiErrorResponse, ApiError, readJson, requireNumber, writeAudit } from "@/lib/http";

export async function POST(request: Request) {
  try {
    const user = await requireUser(["BUSINESS"]);
    const [business] = await db.select().from(businesses).where(eq(businesses.ownerId, user.id)).limit(1);
    if (!business) throw new ApiError("Business profile not found", 404);
    const body = await readJson<Record<string, unknown>>(request);
    const days = Math.round(requireNumber(body.days ?? 7, "Forecast days", 1, 7));
    const rows = await db.select({ categoryId: salesHistory.categoryId, categoryName: foodCategories.name, date: salesHistory.businessDate, preparedKg: salesHistory.preparedKg, soldKg: salesHistory.soldKg, leftoverKg: salesHistory.leftoverKg, discountPercent: salesHistory.discountPercent, promotionActive: salesHistory.promotionActive, holidayOrFestival: salesHistory.holidayOrFestival }).from(salesHistory).innerJoin(foodCategories, eq(foodCategories.id, salesHistory.categoryId)).where(eq(salesHistory.businessId, business.id)).orderBy(asc(salesHistory.businessDate));
    if (!rows.length) throw new ApiError("Add historical sales before generating a forecast", 422);
    const grouped = Map.groupBy(rows, (row) => row.categoryId);
    const result = [];
    for (const [categoryId, historyRows] of grouped) {
      const history: HistoryPoint[] = historyRows.map((row) => ({ date: row.date, preparedKg: row.preparedKg, soldKg: row.soldKg, leftoverKg: row.leftoverKg, discountPercent: row.discountPercent, promotionActive: row.promotionActive, holidayOrFestival: row.holidayOrFestival }));
      const forecast = generateForecast(history, days, false);
      for (const point of forecast) {
        await db.insert(surplusPredictions).values({ businessId: business.id, categoryId, forecastDate: point.date, predictedPreparedKg: point.expectedPreparedKg, predictedDemandKg: point.expectedDemandKg, predictedSurplusKg: point.predictedSurplusKg, lowerBoundKg: point.lowerBoundKg, upperBoundKg: point.upperBoundKg, confidence: point.confidence / 100, importantFactors: point.factors, isFallback: true }).onConflictDoUpdate({ target: [surplusPredictions.businessId, surplusPredictions.categoryId, surplusPredictions.forecastDate], set: { predictedPreparedKg: point.expectedPreparedKg, predictedDemandKg: point.expectedDemandKg, predictedSurplusKg: point.predictedSurplusKg, lowerBoundKg: point.lowerBoundKg, upperBoundKg: point.upperBoundKg, confidence: point.confidence / 100, importantFactors: point.factors, isFallback: true, createdAt: new Date() } });
      }
      result.push({ categoryId, categoryName: historyRows[0].categoryName, forecast, evaluation: chronologicalEvaluation(history) });
    }
    await writeAudit({ actorId: user.id, action: "FORECAST_GENERATED", entityType: "BUSINESS", entityId: business.id, details: { categories: result.length, days, method: "SEASONAL_NAIVE_FALLBACK" } });
    return Response.json({ data: result, label: "Deterministic seasonal-naive fallback using synthetic/user-entered history", trainedModelDeployed: false });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
