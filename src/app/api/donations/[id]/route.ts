import { eq } from "drizzle-orm";
import { db } from "@/db";
import { businesses, donationItems, donationOffers, donations, foodCategories, ngos, pickupRecords, reservations } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { apiErrorResponse, ApiError } from "@/lib/http";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const [donation] = await db.select({ donation: donations, businessName: businesses.name, ownerId: businesses.ownerId }).from(donations).innerJoin(businesses, eq(businesses.id, donations.businessId)).where(eq(donations.id, id)).limit(1);
    if (!donation) throw new ApiError("Donation not found", 404);
    const items = await db.select({ id: donationItems.id, name: donationItems.name, categoryId: donationItems.categoryId, categoryName: foodCategories.name, quantityKg: donationItems.quantityKg, dietaryTags: donationItems.dietaryTags, allergenNotes: donationItems.allergenNotes }).from(donationItems).innerJoin(foodCategories, eq(foodCategories.id, donationItems.categoryId)).where(eq(donationItems.donationId, id));
    let offers: Array<typeof donationOffers.$inferSelect>;
    if (user.role === "NGO") {
      const [ngo] = await db.select({ id: ngos.id }).from(ngos).where(eq(ngos.ownerId, user.id)).limit(1);
      offers = ngo ? await db.select().from(donationOffers).where(eq(donationOffers.ngoId, ngo.id)) : [];
      offers = offers.filter((offer) => offer.donationId === id);
    } else if (user.role === "ADMIN" || donation.ownerId === user.id) {
      offers = await db.select().from(donationOffers).where(eq(donationOffers.donationId, id));
    } else {
      offers = [];
    }
    let pickupPlan: Array<{ reservation: typeof reservations.$inferSelect; pickup: typeof pickupRecords.$inferSelect | null }> = [];
    if (user.role === "ADMIN" || donation.ownerId === user.id) {
      pickupPlan = await db.select({ reservation: reservations, pickup: pickupRecords }).from(reservations).leftJoin(pickupRecords, eq(pickupRecords.reservationId, reservations.id)).where(eq(reservations.donationId, id));
    } else if (user.role === "NGO") {
      const [ngo] = await db.select({ id: ngos.id }).from(ngos).where(eq(ngos.ownerId, user.id)).limit(1);
      if (ngo) pickupPlan = (await db.select({ reservation: reservations, pickup: pickupRecords }).from(reservations).leftJoin(pickupRecords, eq(pickupRecords.reservationId, reservations.id)).where(eq(reservations.ngoId, ngo.id))).filter((row) => row.reservation.donationId === id);
    }
    return Response.json({ donation: donation.donation, businessName: donation.businessName, items, offers, pickupPlan });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
