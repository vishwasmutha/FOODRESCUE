import "dotenv/config";
import { pbkdf2 as pbkdf2Callback, randomBytes } from "node:crypto";
import { promisify } from "node:util";
import { and, eq } from "drizzle-orm";
import { db, pool } from "../src/db";
import {
  auditLogs,
  businesses,
  donations,
  donationItems,
  foodCategories,
  modelVersions,
  ngoAcceptedCategories,
  ngoOperatingHours,
  ngos,
  notifications,
  salesHistory,
  systemSettings,
  users,
} from "../src/db/schema";

const pbkdf2 = promisify(pbkdf2Callback);

async function passwordHash(password: string) {
  const salt = randomBytes(16);
  const iterations = 210_000;
  const derived = await pbkdf2(password, salt, iterations, 32, "sha256");
  return `pbkdf2_sha256$${iterations}$${salt.toString("hex")}$${derived.toString("hex")}`;
}

async function user(email: string, name: string, role: "BUSINESS" | "NGO" | "ADMIN") {
  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing[0]) return existing[0];
  const [created] = await db.insert(users).values({ email, name, role, passwordHash: await passwordHash("Demo@123") }).returning();
  return created;
}

async function main() {
  const admin = await user("admin@foodrescue.demo", "Ananya Rao", "ADMIN");
  const businessUser = await user("donor@foodrescue.demo", "Arjun Mehta", "BUSINESS");
  const ngoUser1 = await user("ngo@foodrescue.demo", "Meera Nair", "NGO");
  const ngoUser2 = await user("kitchen@foodrescue.demo", "Rahul Das", "NGO");
  const ngoUser3 = await user("shelter@foodrescue.demo", "Sana Khan", "NGO");

  const categorySeed = [
    ["Cooked Meals", "cooked-meals", "Prepared rice, curries, and complete meals"],
    ["Bakery & Bread", "bakery-bread", "Bread, buns, and baked goods"],
    ["Fresh Produce", "fresh-produce", "Whole fruits and vegetables"],
    ["Packaged Food", "packaged-food", "Sealed, labelled packaged foods"],
    ["Dairy", "dairy", "Milk and dairy products requiring suitable handling"],
  ] as const;
  for (const [name, slug, description] of categorySeed) {
    await db.insert(foodCategories).values({ name, slug, description, defaultHandlingNotes: "Follow organization policy and applicable local food handling guidance; manual review required." }).onConflictDoNothing();
  }
  const categories = await db.select().from(foodCategories);
  const bySlug = Object.fromEntries(categories.map((category) => [category.slug, category]));

  let [business] = await db.select().from(businesses).where(eq(businesses.ownerId, businessUser.id)).limit(1);
  if (!business) {
    [business] = await db.insert(businesses).values({
      ownerId: businessUser.id,
      name: "Green Bowl Kitchen",
      businessType: "Restaurant",
      description: "Synthetic demo restaurant profile for end-to-end testing.",
      address: "Indiranagar, Bengaluru, Karnataka",
      city: "Bengaluru",
      latitude: 12.9719,
      longitude: 77.6412,
      verificationStatus: "VERIFIED",
      defaultPickupNotes: "Use the service entrance and show the pickup confirmation code.",
    }).returning();
  }

  const ngoDefinitions = [
    { owner: ngoUser1, name: "Asha Community Kitchen", address: "Domlur, Bengaluru", lat: 12.9611, lon: 77.6387, cap: 35, distance: 15, requirements: "Accepts vegetarian cooked meals, bread, fruits and sealed packaged food. Can collect up to 35 kg between 7 PM and 10 PM with ambient or hot-held transport.", tags: ["VEGETARIAN", "VEGAN"], storage: ["AMBIENT", "HOT_HELD", "CHILLED"], slugs: ["cooked-meals", "bakery-bread", "fresh-produce", "packaged-food"] },
    { owner: ngoUser2, name: "Namma Night Shelter", address: "Ulsoor, Bengaluru", lat: 12.9817, lon: 77.6286, cap: 18, distance: 10, requirements: "Vegetarian cooked meals and bakery items for evening service. Collection team available 6 PM to 9:30 PM.", tags: ["VEGETARIAN_ONLY"], storage: ["AMBIENT", "HOT_HELD"], slugs: ["cooked-meals", "bakery-bread"] },
    { owner: ngoUser3, name: "Seva Food Bank", address: "Koramangala, Bengaluru", lat: 12.9352, lon: 77.6245, cap: 60, distance: 18, requirements: "Receives sealed packaged food, fresh produce and bread with traceable packaging. Pickup between 8 AM and 8 PM.", tags: ["VEGETARIAN", "NON_VEGETARIAN"], storage: ["AMBIENT", "CHILLED", "FROZEN"], slugs: ["packaged-food", "fresh-produce", "bakery-bread", "dairy"] },
  ];
  const ngoRows = [];
  for (const definition of ngoDefinitions) {
    let [ngo] = await db.select().from(ngos).where(eq(ngos.ownerId, definition.owner.id)).limit(1);
    if (!ngo) {
      [ngo] = await db.insert(ngos).values({
        ownerId: definition.owner.id,
        name: definition.name,
        description: "Synthetic organization profile — not a claimed real-world partnership.",
        requirementsText: definition.requirements,
        address: definition.address,
        city: "Bengaluru",
        latitude: definition.lat,
        longitude: definition.lon,
        maxCapacityKg: definition.cap,
        currentCapacityKg: definition.cap,
        maxTravelDistanceKm: definition.distance,
        dietaryPreferences: definition.tags,
        storageCapabilities: definition.storage,
        hasTransport: true,
        acceptsPartial: true,
        verificationStatus: "VERIFIED",
      }).returning();
    }
    ngoRows.push(ngo);
    for (const slug of definition.slugs) {
      await db.insert(ngoAcceptedCategories).values({ ngoId: ngo.id, categoryId: bySlug[slug].id }).onConflictDoNothing();
    }
    const hours = await db.select().from(ngoOperatingHours).where(eq(ngoOperatingHours.ngoId, ngo.id));
    if (!hours.length) {
      await db.insert(ngoOperatingHours).values(Array.from({ length: 7 }, (_, day) => ({ ngoId: ngo.id, dayOfWeek: day, opensAt: definition.name === "Seva Food Bank" ? "08:00" : definition.name === "Namma Night Shelter" ? "18:00" : "19:00", closesAt: definition.name === "Seva Food Bank" ? "20:00" : definition.name === "Namma Night Shelter" ? "21:30" : "22:00", pickupAvailable: true })));
    }
  }

  const cooked = bySlug["cooked-meals"];
  const bakery = bySlug["bakery-bread"];
  const today = new Date();
  const historyRows = [];
  for (let day = 56; day >= 1; day -= 1) {
    const date = new Date(today);
    date.setUTCDate(date.getUTCDate() - day);
    const dateText = date.toISOString().slice(0, 10);
    const weekday = date.getUTCDay();
    const weekendLift = weekday === 0 || weekday === 6 ? 5.5 : 0;
    const wave = Math.sin(day * 0.7);
    const prepared = 48 + weekendLift + wave * 3;
    const sold = prepared - (7 + Math.cos(day * 0.51) * 2.4);
    historyRows.push({ businessId: business.id, categoryId: cooked.id, businessDate: dateText, preparedKg: Number(prepared.toFixed(1)), soldKg: Number(sold.toFixed(1)), leftoverKg: Number((prepared - sold).toFixed(1)), safeDonationKg: Number(Math.max(0, prepared - sold - 0.8).toFixed(1)), orderCount: Math.round(sold * 2.3), reservations: weekday === 5 ? 14 : 6, discountPercent: day % 9 === 0 ? 10 : 0, promotionActive: day % 9 === 0, holidayOrFestival: null, source: "SYNTHETIC" as const });
    const bakeryPrepared = 27 + Math.sin(day * 0.4) * 2;
    const bakerySold = bakeryPrepared - (3.8 + Math.cos(day * 0.33));
    historyRows.push({ businessId: business.id, categoryId: bakery.id, businessDate: dateText, preparedKg: Number(bakeryPrepared.toFixed(1)), soldKg: Number(bakerySold.toFixed(1)), leftoverKg: Number((bakeryPrepared - bakerySold).toFixed(1)), safeDonationKg: Number(Math.max(0, bakeryPrepared - bakerySold - 0.4).toFixed(1)), orderCount: Math.round(bakerySold * 1.8), reservations: 0, discountPercent: 0, promotionActive: false, holidayOrFestival: null, source: "SYNTHETIC" as const });
  }
  await db.insert(salesHistory).values(historyRows).onConflictDoNothing();

  let [model] = await db.select().from(modelVersions).where(and(eq(modelVersions.name, "FoodRescue GRU Demo"), eq(modelVersions.version, "0.1.0-demo"))).limit(1);
  if (!model) {
    [model] = await db.insert(modelVersions).values({
      name: "FoodRescue GRU Demo",
      version: "0.1.0-demo",
      modelType: "GRU_REFERENCE_PIPELINE",
      status: "VALIDATED_DEMO_NOT_DEPLOYED",
      trainingSource: "SYNTHETIC",
      featureSchema: { sequenceLength: 14, features: ["day_of_week", "prepared_kg", "sold_kg", "leftover_kg", "discount", "promotion"] },
      trainingMetadata: { seed: 42, split: "70/15/15 chronological", note: "Reference artifact is not deployed in the TypeScript runtime." },
      trainedAt: new Date(),
    }).returning();
  }

  const availableFrom = new Date(Date.now() + 15 * 60_000);
  const pickupDeadline = new Date(Date.now() + 3.5 * 60 * 60_000);
  let [liveDonation] = await db.select().from(donations).where(eq(donations.publicId, "FR-2408-DEMO")).limit(1);
  if (!liveDonation) {
    [liveDonation] = await db.insert(donations).values({
      publicId: "FR-2408-DEMO",
      businessId: business.id,
      title: "Vegetarian rice & curry",
      description: "We have around 18 kg of vegetarian rice and curry available at 8:30 PM today. Packed in food-grade containers. Please arrange collection before 10 PM.",
      extractedData: { source: "rule-assisted-demo", reviewed: true },
      status: "AVAILABLE",
      urgency: "TIME_SENSITIVE",
      totalQuantityKg: 18,
      reservedQuantityKg: 0,
      completedQuantityKg: 0,
      availableFrom,
      pickupDeadline,
      preparationTime: new Date(Date.now() - 30 * 60_000),
      storageCondition: "HOT_HELD",
      packagingCondition: "PACKED",
      dietaryTags: ["VEGETARIAN"],
      safetyReviewed: true,
      safetyNotes: "Demo manual review recorded; this is not a real food-safety assessment.",
      latitude: business.latitude,
      longitude: business.longitude,
    }).returning();
    await db.insert(donationItems).values({ donationId: liveDonation.id, categoryId: cooked.id, name: "Rice and curry", quantityKg: 18, dietaryTags: ["VEGETARIAN"] });
  } else {
    await db.update(donations).set({ availableFrom, pickupDeadline, status: liveDonation.reservedQuantityKg > 0 ? liveDonation.status : "AVAILABLE", urgency: "TIME_SENSITIVE", updatedAt: new Date() }).where(eq(donations.id, liveDonation.id));
  }

  const historic = [
    { publicId: "FR-HIST-001", title: "Assorted bread", quantity: 12, completed: 12, days: 3, status: "COMPLETED" as const },
    { publicId: "FR-HIST-002", title: "Vegetarian meals", quantity: 22, completed: 20, days: 7, status: "PARTIALLY_COMPLETED" as const },
    { publicId: "FR-HIST-003", title: "Bakery surplus", quantity: 9, completed: 0, days: 11, status: "EXPIRED" as const },
  ];
  for (const item of historic) {
    const end = new Date(Date.now() - item.days * 24 * 60 * 60_000);
    const start = new Date(end.getTime() - 2 * 60 * 60_000);
    await db.insert(donations).values({ publicId: item.publicId, businessId: business.id, title: item.title, description: "Synthetic historical donation for analytics demonstration.", status: item.status, urgency: item.status === "EXPIRED" ? "EXPIRED" : "NORMAL", totalQuantityKg: item.quantity, reservedQuantityKg: item.completed, completedQuantityKg: item.completed, availableFrom: start, pickupDeadline: end, storageCondition: "AMBIENT", packagingCondition: "PACKED", dietaryTags: ["VEGETARIAN"], safetyReviewed: true, latitude: business.latitude, longitude: business.longitude }).onConflictDoNothing();
  }

  await db.insert(systemSettings).values({ key: "matching_weights", value: { compatibility: 0.3, capacity: 0.2, timing: 0.2, distance: 0.15, semantic: 0.15 }, description: "Initial stakeholder-calibration weights; not scientifically validated.", updatedBy: admin.id }).onConflictDoNothing();
  await db.insert(systemSettings).values({ key: "impact_assumptions", value: { kgPerEstimatedMeal: 0.4, co2eKgPerFoodKg: 2.5 }, description: "Configurable demo assumptions. All derived impact values must be labelled estimates.", updatedBy: admin.id }).onConflictDoNothing();

  const existingNotice = await db.select().from(notifications).where(and(eq(notifications.userId, ngoUser1.id), eq(notifications.type, "DEMO_READY"))).limit(1);
  if (!existingNotice.length) await db.insert(notifications).values({ userId: ngoUser1.id, type: "DEMO_READY", title: "New donation near you", message: "18 kg vegetarian rice and curry is available from Green Bowl Kitchen.", actionUrl: `/donations/${liveDonation.id}`, status: "DELIVERED", metadata: { synthetic: true } });
  await db.insert(auditLogs).values({ actorId: admin.id, action: "DEMO_SEED_COMPLETED", entityType: "SYSTEM", details: { synthetic: true, accounts: 5 } });
  console.log("Demo seed complete. Password for all demo accounts: Demo@123");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => pool.end());
