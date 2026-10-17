import "dotenv/config";
import { pbkdf2 as pbkdf2Callback, randomBytes } from "node:crypto";
import { promisify } from "node:util";
import { eq } from "drizzle-orm";
import { db, pool } from "../src/db";
import {
  businesses,
  donationItems,
  donationOffers,
  donations,
  foodCategories,
  ngoAcceptedCategories,
  ngoOperatingHours,
  ngos,
  pickupRecords,
  reservations,
  salesHistory,
  users,
} from "../src/db/schema";

const pbkdf2 = promisify(pbkdf2Callback);

async function passwordHash(password: string) {
  const salt = randomBytes(16);
  const derived = await pbkdf2(password, salt, 210_000, 32, "sha256");
  return `pbkdf2_sha256$210000$${salt.toString("hex")}$${derived.toString("hex")}`;
}

async function user(email: string, name: string, role: "BUSINESS" | "NGO") {
  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing) return existing;
  const [created] = await db.insert(users).values({ email, name, role, passwordHash: await passwordHash("Demo@123") }).returning();
  return created;
}

const businessDefs = [
  { email: "bakery@foodrescue.demo", owner: "Priya Iyer", name: "Sunrise Bakery", type: "Bakery", address: "Jayanagar 4th Block, Bengaluru", lat: 12.925, lon: 77.5938, slug: "bakery-bread", base: 30 },
  { email: "hotel@foodrescue.demo", owner: "Kiran Shetty", name: "Lakeview Hotel Banquets", type: "Hotel", address: "Ulsoor, Bengaluru", lat: 12.9817, lon: 77.6286, slug: "cooked-meals", base: 70 },
  { email: "grocer@foodrescue.demo", owner: "Farah Ali", name: "FreshMart Grocers", type: "Grocery", address: "HSR Layout, Bengaluru", lat: 12.9116, lon: 77.6474, slug: "fresh-produce", base: 40 },
];

const ngoDefs = [
  { email: "annapurna@foodrescue.demo", owner: "Lakshmi Rao", name: "Annapurna Meals Trust", address: "Malleshwaram, Bengaluru", lat: 13.0035, lon: 77.5647, cap: 80, dist: 20, diet: ["VEGETARIAN", "VEGAN"], storage: ["AMBIENT", "HOT_HELD"], slugs: ["cooked-meals", "bakery-bread"], from: "17:00", to: "22:00", text: "Community kitchen serving vegetarian cooked meals and bread every evening." },
  { email: "hopehome@foodrescue.demo", owner: "Thomas Mathew", name: "Hope Children's Home", address: "Jayanagar, Bengaluru", lat: 12.925, lon: 77.5938, cap: 25, dist: 10, diet: ["VEGETARIAN"], storage: ["AMBIENT", "CHILLED"], slugs: ["bakery-bread", "dairy", "packaged-food", "fresh-produce"], from: "09:00", to: "20:00", text: "Children's home accepting bakery, dairy, sealed packaged food and fruit." },
  { email: "oldage@foodrescue.demo", owner: "Meenakshi Pillai", name: "Sandhya Elders Care", address: "Basavanagudi, Bengaluru", lat: 12.9416, lon: 77.5754, cap: 20, dist: 12, diet: ["VEGETARIAN_ONLY"], storage: ["AMBIENT", "HOT_HELD", "CHILLED"], slugs: ["cooked-meals", "fresh-produce", "dairy"], from: "11:00", to: "21:00", text: "Elder care home needing soft vegetarian cooked meals, fruit and dairy." },
  { email: "whitefield@foodrescue.demo", owner: "Arvind Kulkarni", name: "Whitefield Food Share", address: "Whitefield, Bengaluru", lat: 12.9698, lon: 77.75, cap: 50, dist: 25, diet: ["VEGETARIAN", "NON_VEGETARIAN"], storage: ["AMBIENT", "HOT_HELD", "CHILLED", "FROZEN"], slugs: ["cooked-meals", "bakery-bread", "packaged-food", "fresh-produce", "dairy"], from: "10:00", to: "23:00", text: "Volunteer-run network with refrigerated van for all food categories." },
  { email: "hebbal@foodrescue.demo", owner: "Nasreen Banu", name: "Hebbal Community Pantry", address: "Hebbal, Bengaluru", lat: 13.0358, lon: 77.597, cap: 45, dist: 18, diet: ["VEGETARIAN", "NON_VEGETARIAN"], storage: ["AMBIENT", "CHILLED"], slugs: ["packaged-food", "fresh-produce", "bakery-bread"], from: "08:00", to: "19:00", text: "Pantry distributing packaged food, produce and bread to nearby families." },
  { email: "sevamitra@foodrescue.demo", owner: "Gopal Reddy", name: "Seva Mitra Night Kitchen", address: "Shivajinagar, Bengaluru", lat: 12.9857, lon: 77.6057, cap: 65, dist: 15, diet: ["VEGETARIAN", "NON_VEGETARIAN"], storage: ["AMBIENT", "HOT_HELD"], slugs: ["cooked-meals", "bakery-bread"], from: "18:00", to: "23:30", text: "Late-night kitchen serving cooked meals to daily-wage workers." },
  { email: "marathahalli@foodrescue.demo", owner: "Divya Menon", name: "Marathahalli Meal Bank", address: "Marathahalli, Bengaluru", lat: 12.9591, lon: 77.6974, cap: 40, dist: 14, diet: ["VEGETARIAN"], storage: ["AMBIENT", "HOT_HELD", "CHILLED"], slugs: ["cooked-meals", "packaged-food", "dairy"], from: "12:00", to: "22:00", text: "Meal bank for migrant workers; vegetarian cooked meals and packaged food." },
  { email: "rajaji@foodrescue.demo", owner: "Suresh Babu", name: "Rajajinagar Seva Sangha", address: "Rajajinagar, Bengaluru", lat: 12.9915, lon: 77.5521, cap: 30, dist: 12, diet: ["VEGETARIAN_ONLY"], storage: ["AMBIENT"], slugs: ["bakery-bread", "fresh-produce", "packaged-food"], from: "07:00", to: "18:00", text: "Temple trust food distribution for vegetarian ambient items only." },
  { email: "ecity@foodrescue.demo", owner: "Ramesh Naidu", name: "Electronic City Food Rescue", address: "Electronic City, Bengaluru", lat: 12.8452, lon: 77.6602, cap: 100, dist: 30, diet: ["VEGETARIAN", "NON_VEGETARIAN", "VEGAN"], storage: ["AMBIENT", "HOT_HELD", "CHILLED", "FROZEN"], slugs: ["cooked-meals", "bakery-bread", "packaged-food", "fresh-produce", "dairy"], from: "00:00", to: "23:59", text: "Large 24-hour rescue hub with cold storage and two vehicles." },
];

async function main() {
  const categories = await db.select().from(foodCategories);
  const bySlug = Object.fromEntries(categories.map((category) => [category.slug, category]));

  const businessRows = [];
  for (const def of businessDefs) {
    const owner = await user(def.email, def.owner, "BUSINESS");
    let [business] = await db.select().from(businesses).where(eq(businesses.ownerId, owner.id)).limit(1);
    if (!business) {
      [business] = await db.insert(businesses).values({ ownerId: owner.id, name: def.name, businessType: def.type, description: "Synthetic demo business profile.", address: def.address, city: "Bengaluru", latitude: def.lat, longitude: def.lon, verificationStatus: "VERIFIED", defaultPickupNotes: "Ask for the duty manager at the back entrance." }).returning();
    }
    businessRows.push({ business, def });
    const history = [];
    for (let day = 60; day >= 1; day -= 1) {
      const date = new Date();
      date.setUTCDate(date.getUTCDate() - day);
      const weekday = date.getUTCDay();
      const prepared = def.base + (weekday === 0 || weekday === 6 ? def.base * 0.15 : 0) + Math.sin(day * 0.6) * def.base * 0.06;
      const leftover = def.base * 0.14 + Math.cos(day * 0.45) * def.base * 0.04;
      const sold = prepared - leftover;
      history.push({ businessId: business.id, categoryId: bySlug[def.slug].id, businessDate: date.toISOString().slice(0, 10), preparedKg: Number(prepared.toFixed(1)), soldKg: Number(sold.toFixed(1)), leftoverKg: Number(leftover.toFixed(1)), safeDonationKg: Number(Math.max(0, leftover - 0.5).toFixed(1)), orderCount: Math.round(sold * 2), reservations: weekday === 5 ? 8 : 3, discountPercent: day % 10 === 0 ? 10 : 0, promotionActive: day % 10 === 0, source: "SYNTHETIC" as const });
    }
    await db.insert(salesHistory).values(history).onConflictDoNothing();
  }

  const ngoRows = [];
  for (const def of ngoDefs) {
    const owner = await user(def.email, def.owner, "NGO");
    let [ngo] = await db.select().from(ngos).where(eq(ngos.ownerId, owner.id)).limit(1);
    if (!ngo) {
      [ngo] = await db.insert(ngos).values({ ownerId: owner.id, name: def.name, description: "Synthetic organization profile — not a claimed real-world partnership.", requirementsText: def.text, address: def.address, city: "Bengaluru", latitude: def.lat, longitude: def.lon, maxCapacityKg: def.cap, currentCapacityKg: def.cap, maxTravelDistanceKm: def.dist, dietaryPreferences: def.diet, storageCapabilities: def.storage, hasTransport: true, acceptsPartial: true, verificationStatus: "VERIFIED" }).returning();
      for (const slug of def.slugs) await db.insert(ngoAcceptedCategories).values({ ngoId: ngo.id, categoryId: bySlug[slug].id }).onConflictDoNothing();
      await db.insert(ngoOperatingHours).values(Array.from({ length: 7 }, (_, day) => ({ ngoId: ngo.id, dayOfWeek: day, opensAt: def.from, closesAt: def.to, pickupAvailable: true })));
    }
    ngoRows.push(ngo);
  }

  // Completed / partial / expired rescues for analytics across all businesses.
  const outcomes = [
    { status: "COMPLETED" as const, factor: 1 },
    { status: "COMPLETED" as const, factor: 1 },
    { status: "PARTIALLY_COMPLETED" as const, factor: 0.7 },
    { status: "EXPIRED" as const, factor: 0 },
    { status: "COMPLETED" as const, factor: 1 },
    { status: "CANCELLED" as const, factor: 0 },
  ];
  let counter = 0;
  for (const { business, def } of businessRows) {
    for (const [index, outcome] of outcomes.entries()) {
      counter += 1;
      const publicId = `FR-X${String(counter).padStart(3, "0")}`;
      const [exists] = await db.select({ id: donations.id }).from(donations).where(eq(donations.publicId, publicId)).limit(1);
      if (exists) continue;
      const qty = 8 + ((counter * 7) % 20);
      const end = new Date(Date.now() - (index * 3 + 2) * 24 * 60 * 60_000);
      const start = new Date(end.getTime() - 3 * 60 * 60_000);
      const done = Number((qty * outcome.factor).toFixed(1));
      const [donation] = await db.insert(donations).values({ publicId, businessId: business.id, title: `${def.type} surplus ${index + 1}`, description: `Synthetic historical ${def.type.toLowerCase()} donation for analytics.`, status: outcome.status, urgency: outcome.status === "EXPIRED" ? "EXPIRED" : "NORMAL", totalQuantityKg: qty, reservedQuantityKg: done, completedQuantityKg: done, availableFrom: start, pickupDeadline: end, storageCondition: "AMBIENT", packagingCondition: "PACKED", dietaryTags: ["VEGETARIAN"], safetyReviewed: true, latitude: business.latitude, longitude: business.longitude }).returning();
      await db.insert(donationItems).values({ donationId: donation.id, categoryId: bySlug[def.slug].id, name: donation.title, quantityKg: qty, dietaryTags: ["VEGETARIAN"] });
      if (done > 0) {
        const ngo = ngoRows[(counter + index) % ngoRows.length];
        const [offer] = await db.insert(donationOffers).values({ donationId: donation.id, ngoId: ngo.id, offeredQuantityKg: done, status: outcome.status === "COMPLETED" ? "ACCEPTED" : "PARTIAL", matchScore: 60 + ((counter * 11) % 35), recommendationReason: "Synthetic historical offer.", expiresAt: end, respondedAt: start }).returning();
        const [reservation] = await db.insert(reservations).values({ offerId: offer.id, donationId: donation.id, ngoId: ngo.id, quantityKg: done, status: "FULFILLED" }).returning();
        await db.insert(pickupRecords).values({ reservationId: reservation.id, status: "RECEIVED", scheduledAt: start, handoverAt: end, receivedAt: end, handedOverQuantityKg: done });
      }
    }
  }
  console.log(`Extra seed complete: ${businessDefs.length} businesses, ${ngoDefs.length} NGOs (password Demo@123).`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => pool.end());
