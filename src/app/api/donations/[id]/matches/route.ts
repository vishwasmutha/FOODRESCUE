import { eq } from "drizzle-orm";
import { db } from "@/db";
import { businesses, donations } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getDonationMatches } from "@/lib/match-service";
import { apiErrorResponse, ApiError } from "@/lib/http";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(["BUSINESS", "ADMIN"]);
    const { id } = await params;
    if (user.role === "BUSINESS") {
      const [owned] = await db.select({ id: donations.id }).from(donations).innerJoin(businesses, eq(businesses.id, donations.businessId)).where(eq(donations.id, id)).limit(1);
      const [business] = await db.select({ id: businesses.id }).from(businesses).where(eq(businesses.ownerId, user.id)).limit(1);
      const [record] = await db.select({ businessId: donations.businessId }).from(donations).where(eq(donations.id, id)).limit(1);
      if (!owned || !business || record?.businessId !== business.id) throw new ApiError("Donation not found", 404);
    }
    const result = await getDonationMatches(id);
    const eligible = result.matches.filter((match) => match.eligible);
    return Response.json({ ...result, eligible, noMatchFallback: eligible.length ? null : { message: "No eligible recipient currently matches every hard constraint.", actions: ["Review partial quantity options", "Expand radius only within recipient limits", "Relist with a later verified collection window", "Do not relax safety requirements"] }, weights: { compatibility: 30, capacity: 20, timing: 20, distance: 15, semantic: 15 }, calibrationNote: "Initial configurable weights; not scientifically validated." });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
