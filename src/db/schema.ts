import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const userRoleEnum = pgEnum("user_role", ["BUSINESS", "NGO", "ADMIN"]);
export const verificationEnum = pgEnum("verification_status", ["PENDING", "VERIFIED", "SUSPENDED"]);
export const donationStatusEnum = pgEnum("donation_status", [
  "PREDICTED",
  "DRAFT",
  "AVAILABLE",
  "OFFERED",
  "ACCEPTED",
  "PICKUP_IN_PROGRESS",
  "COMPLETED",
  "PARTIALLY_COMPLETED",
  "REJECTED",
  "CANCELLED",
  "EXPIRED",
  "UNSAFE",
  "FAILED_PICKUP",
]);
export const offerStatusEnum = pgEnum("offer_status", ["PENDING", "ACCEPTED", "PARTIAL", "REJECTED", "EXPIRED", "CANCELLED"]);
export const reservationStatusEnum = pgEnum("reservation_status", ["ACTIVE", "FULFILLED", "RELEASED", "EXPIRED"]);
export const urgencyEnum = pgEnum("urgency_status", ["NORMAL", "TIME_SENSITIVE", "URGENT", "EXPIRED", "MANUAL_REVIEW"]);
export const notificationStatusEnum = pgEnum("notification_status", ["QUEUED", "DELIVERED", "READ", "FAILED"]);
export const pickupStatusEnum = pgEnum("pickup_status", ["SCHEDULED", "IN_PROGRESS", "HANDED_OVER", "RECEIVED", "FAILED", "CANCELLED"]);
export const dataSourceEnum = pgEnum("data_source", ["SYNTHETIC", "USER_ENTERED", "CSV_IMPORT", "MODEL"]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: varchar("email", { length: 320 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    role: userRoleEnum("role").notNull(),
    phone: varchar("phone", { length: 24 }),
    timezone: varchar("timezone", { length: 80 }).notNull().default("Asia/Kolkata"),
    locale: varchar("locale", { length: 10 }).notNull().default("en-IN"),
    notificationPreferences: jsonb("notification_preferences").notNull().default({ inApp: true, email: false, urgentOnly: false }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("users_email_unique").on(sql`lower(${table.email})`), index("users_role_idx").on(table.role)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("sessions_user_idx").on(table.userId), index("sessions_expiry_idx").on(table.expiresAt)],
);

export const businesses = pgTable(
  "businesses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: uuid("owner_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 180 }).notNull(),
    businessType: varchar("business_type", { length: 80 }).notNull(),
    description: text("description"),
    address: text("address").notNull(),
    city: varchar("city", { length: 100 }).notNull().default("Bengaluru"),
    latitude: real("latitude"),
    longitude: real("longitude"),
    verificationStatus: verificationEnum("verification_status").notNull().default("PENDING"),
    defaultPickupNotes: text("default_pickup_notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("businesses_verification_idx").on(table.verificationStatus)],
);

export const ngos = pgTable(
  "ngos",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: uuid("owner_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 180 }).notNull(),
    registrationNumber: varchar("registration_number", { length: 100 }),
    description: text("description"),
    requirementsText: text("requirements_text"),
    address: text("address").notNull(),
    city: varchar("city", { length: 100 }).notNull().default("Bengaluru"),
    latitude: real("latitude"),
    longitude: real("longitude"),
    maxCapacityKg: real("max_capacity_kg").notNull().default(25),
    currentCapacityKg: real("current_capacity_kg").notNull().default(25),
    maxTravelDistanceKm: real("max_travel_distance_km").notNull().default(12),
    minRemainingShelfLifeMinutes: integer("min_remaining_shelf_life_minutes").notNull().default(60),
    hasTransport: boolean("has_transport").notNull().default(true),
    acceptsPartial: boolean("accepts_partial").notNull().default(true),
    storageCapabilities: text("storage_capabilities").array().notNull().default(sql`ARRAY['AMBIENT']::text[]`),
    dietaryPreferences: text("dietary_preferences").array().notNull().default(sql`ARRAY['VEGETARIAN']::text[]`),
    verificationStatus: verificationEnum("verification_status").notNull().default("PENDING"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("ngos_verification_idx").on(table.verificationStatus),
    index("ngos_location_idx").on(table.city),
    check("ngos_capacity_nonnegative", sql`${table.currentCapacityKg} >= 0 AND ${table.maxCapacityKg} >= ${table.currentCapacityKg}`),
  ],
);

export const foodCategories = pgTable(
  "food_categories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 100 }).notNull().unique(),
    slug: varchar("slug", { length: 100 }).notNull().unique(),
    description: text("description"),
    defaultHandlingNotes: text("default_handling_notes"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

export const ngoAcceptedCategories = pgTable(
  "ngo_accepted_categories",
  {
    ngoId: uuid("ngo_id").notNull().references(() => ngos.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").notNull().references(() => foodCategories.id, { onDelete: "cascade" }),
    priority: integer("priority").notNull().default(1),
  },
  (table) => [primaryKey({ columns: [table.ngoId, table.categoryId] })],
);

export const ngoOperatingHours = pgTable(
  "ngo_operating_hours",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ngoId: uuid("ngo_id").notNull().references(() => ngos.id, { onDelete: "cascade" }),
    dayOfWeek: integer("day_of_week").notNull(),
    opensAt: time("opens_at").notNull(),
    closesAt: time("closes_at").notNull(),
    pickupAvailable: boolean("pickup_available").notNull().default(true),
  },
  (table) => [index("ngo_hours_lookup_idx").on(table.ngoId, table.dayOfWeek), check("valid_day_of_week", sql`${table.dayOfWeek} BETWEEN 0 AND 6`)],
);

export const salesHistory = pgTable(
  "sales_history",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").notNull().references(() => foodCategories.id),
    businessDate: date("business_date").notNull(),
    preparedKg: real("prepared_kg").notNull(),
    soldKg: real("sold_kg").notNull(),
    leftoverKg: real("leftover_kg").notNull(),
    safeDonationKg: real("safe_donation_kg"),
    orderCount: integer("order_count"),
    reservations: integer("reservations"),
    discountPercent: real("discount_percent").notNull().default(0),
    promotionActive: boolean("promotion_active").notNull().default(false),
    holidayOrFestival: varchar("holiday_or_festival", { length: 100 }),
    weatherSummary: varchar("weather_summary", { length: 100 }),
    source: dataSourceEnum("source").notNull().default("USER_ENTERED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("sales_business_category_date_unique").on(table.businessId, table.categoryId, table.businessDate),
    index("sales_chronological_idx").on(table.businessId, table.businessDate),
    check("sales_quantities_nonnegative", sql`${table.preparedKg} >= 0 AND ${table.soldKg} >= 0 AND ${table.leftoverKg} >= 0`),
  ],
);

export const modelVersions = pgTable(
  "model_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 140 }).notNull(),
    version: varchar("version", { length: 40 }).notNull(),
    modelType: varchar("model_type", { length: 60 }).notNull(),
    status: varchar("status", { length: 40 }).notNull().default("VALIDATED_DEMO"),
    trainingSource: dataSourceEnum("training_source").notNull().default("SYNTHETIC"),
    featureSchema: jsonb("feature_schema").notNull().default({}),
    trainingMetadata: jsonb("training_metadata").notNull().default({}),
    artifactPath: text("artifact_path"),
    trainedAt: timestamp("trained_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("model_name_version_unique").on(table.name, table.version)],
);

export const modelEvaluations = pgTable(
  "model_evaluations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    modelVersionId: uuid("model_version_id").notNull().references(() => modelVersions.id, { onDelete: "cascade" }),
    splitStrategy: varchar("split_strategy", { length: 120 }).notNull(),
    evaluatedSamples: integer("evaluated_samples").notNull(),
    mae: real("mae"),
    rmse: real("rmse"),
    baselineMae: real("baseline_mae"),
    baselineRmse: real("baseline_rmse"),
    metrics: jsonb("metrics").notNull().default({}),
    evaluatedAt: timestamp("evaluated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("model_evaluations_version_idx").on(table.modelVersionId)],
);

export const surplusPredictions = pgTable(
  "surplus_predictions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").notNull().references(() => foodCategories.id),
    modelVersionId: uuid("model_version_id").references(() => modelVersions.id),
    forecastDate: date("forecast_date").notNull(),
    predictedPreparedKg: real("predicted_prepared_kg").notNull(),
    predictedDemandKg: real("predicted_demand_kg").notNull(),
    predictedSurplusKg: real("predicted_surplus_kg").notNull(),
    lowerBoundKg: real("lower_bound_kg"),
    upperBoundKg: real("upper_bound_kg"),
    confidence: real("confidence"),
    importantFactors: jsonb("important_factors").notNull().default([]),
    isFallback: boolean("is_fallback").notNull().default(true),
    source: dataSourceEnum("source").notNull().default("MODEL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("prediction_unique").on(table.businessId, table.categoryId, table.forecastDate), index("prediction_date_idx").on(table.forecastDate)],
);

export const actualSurplus = pgTable(
  "actual_surplus",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    predictionId: uuid("prediction_id").references(() => surplusPredictions.id, { onDelete: "set null" }),
    businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").notNull().references(() => foodCategories.id),
    observationDate: date("observation_date").notNull(),
    actualSurplusKg: real("actual_surplus_kg").notNull(),
    safeDonationKg: real("safe_donation_kg"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("actual_surplus_unique").on(table.businessId, table.categoryId, table.observationDate)],
);

export const donations = pgTable(
  "donations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    publicId: varchar("public_id", { length: 24 }).notNull().unique(),
    businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    predictionId: uuid("prediction_id").references(() => surplusPredictions.id, { onDelete: "set null" }),
    title: varchar("title", { length: 180 }).notNull(),
    description: text("description").notNull(),
    extractedData: jsonb("extracted_data").notNull().default({}),
    status: donationStatusEnum("status").notNull().default("DRAFT"),
    urgency: urgencyEnum("urgency").notNull().default("MANUAL_REVIEW"),
    totalQuantityKg: real("total_quantity_kg").notNull(),
    reservedQuantityKg: real("reserved_quantity_kg").notNull().default(0),
    completedQuantityKg: real("completed_quantity_kg").notNull().default(0),
    availableFrom: timestamp("available_from", { withTimezone: true }).notNull(),
    pickupDeadline: timestamp("pickup_deadline", { withTimezone: true }).notNull(),
    preparationTime: timestamp("preparation_time", { withTimezone: true }),
    storageCondition: varchar("storage_condition", { length: 80 }),
    packagingCondition: varchar("packaging_condition", { length: 100 }),
    dietaryTags: text("dietary_tags").array().notNull().default(sql`ARRAY[]::text[]`),
    safetyReviewed: boolean("safety_reviewed").notNull().default(false),
    safetyNotes: text("safety_notes"),
    latitude: real("latitude"),
    longitude: real("longitude"),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("donations_status_deadline_idx").on(table.status, table.pickupDeadline),
    index("donations_business_idx").on(table.businessId, table.createdAt),
    check("donation_quantity_valid", sql`${table.totalQuantityKg} > 0 AND ${table.reservedQuantityKg} >= 0 AND ${table.completedQuantityKg} >= 0 AND ${table.reservedQuantityKg} <= ${table.totalQuantityKg} AND ${table.completedQuantityKg} <= ${table.totalQuantityKg}`),
    check("donation_window_valid", sql`${table.pickupDeadline} > ${table.availableFrom}`),
  ],
);

export const donationItems = pgTable(
  "donation_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    donationId: uuid("donation_id").notNull().references(() => donations.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").notNull().references(() => foodCategories.id),
    name: varchar("name", { length: 180 }).notNull(),
    quantityKg: real("quantity_kg").notNull(),
    dietaryTags: text("dietary_tags").array().notNull().default(sql`ARRAY[]::text[]`),
    allergenNotes: text("allergen_notes"),
  },
  (table) => [index("donation_items_donation_idx").on(table.donationId), check("donation_item_quantity_positive", sql`${table.quantityKg} > 0`)],
);

export const donationOffers = pgTable(
  "donation_offers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    donationId: uuid("donation_id").notNull().references(() => donations.id, { onDelete: "cascade" }),
    ngoId: uuid("ngo_id").notNull().references(() => ngos.id, { onDelete: "cascade" }),
    offeredQuantityKg: real("offered_quantity_kg").notNull(),
    status: offerStatusEnum("status").notNull().default("PENDING"),
    matchScore: real("match_score").notNull(),
    scoreBreakdown: jsonb("score_breakdown").notNull().default({}),
    recommendationReason: text("recommendation_reason"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 120 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("offer_donation_ngo_unique").on(table.donationId, table.ngoId),
    uniqueIndex("offer_idempotency_unique").on(table.idempotencyKey),
    index("offers_ngo_status_idx").on(table.ngoId, table.status),
    check("offer_quantity_positive", sql`${table.offeredQuantityKg} > 0`),
  ],
);

export const offerResponses = pgTable(
  "offer_responses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    offerId: uuid("offer_id").notNull().references(() => donationOffers.id, { onDelete: "cascade" }),
    responderId: uuid("responder_id").notNull().references(() => users.id),
    action: varchar("action", { length: 40 }).notNull(),
    requestedQuantityKg: real("requested_quantity_kg"),
    message: text("message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("offer_responses_offer_idx").on(table.offerId)],
);

export const reservations = pgTable(
  "reservations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    offerId: uuid("offer_id").notNull().unique().references(() => donationOffers.id, { onDelete: "cascade" }),
    donationId: uuid("donation_id").notNull().references(() => donations.id, { onDelete: "cascade" }),
    ngoId: uuid("ngo_id").notNull().references(() => ngos.id),
    quantityKg: real("quantity_kg").notNull(),
    status: reservationStatusEnum("status").notNull().default("ACTIVE"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("reservations_donation_status_idx").on(table.donationId, table.status), check("reservation_quantity_positive", sql`${table.quantityKg} > 0`)],
);

export const pickupRecords = pgTable(
  "pickup_records",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    reservationId: uuid("reservation_id").notNull().unique().references(() => reservations.id, { onDelete: "cascade" }),
    status: pickupStatusEnum("status").notNull().default("SCHEDULED"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    handoverAt: timestamp("handover_at", { withTimezone: true }),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    handedOverQuantityKg: real("handed_over_quantity_kg"),
    donorConfirmationCode: varchar("donor_confirmation_code", { length: 12 }),
    recipientConfirmationCode: varchar("recipient_confirmation_code", { length: 12 }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("pickups_status_idx").on(table.status)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 60 }).notNull(),
    title: varchar("title", { length: 180 }).notNull(),
    message: text("message").notNull(),
    actionUrl: text("action_url"),
    status: notificationStatusEnum("status").notNull().default("DELIVERED"),
    attempts: integer("attempts").notNull().default(1),
    metadata: jsonb("metadata").notNull().default({}),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }).defaultNow(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("notifications_user_status_idx").on(table.userId, table.status, table.createdAt)],
);

export const userFeedback = pgTable(
  "user_feedback",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    donationId: uuid("donation_id").references(() => donations.id, { onDelete: "set null" }),
    predictionId: uuid("prediction_id").references(() => surplusPredictions.id, { onDelete: "set null" }),
    rating: integer("rating"),
    type: varchar("type", { length: 60 }).notNull(),
    comments: text("comments"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("feedback_type_idx").on(table.type), check("feedback_rating_range", sql`${table.rating} IS NULL OR ${table.rating} BETWEEN 1 AND 5`)],
);

export const systemSettings = pgTable("system_settings", {
  key: varchar("key", { length: 120 }).primaryKey(),
  value: jsonb("value").notNull(),
  description: text("description"),
  updatedBy: uuid("updated_by").references(() => users.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: varchar("action", { length: 100 }).notNull(),
    entityType: varchar("entity_type", { length: 80 }).notNull(),
    entityId: varchar("entity_id", { length: 100 }),
    ipAddress: varchar("ip_address", { length: 64 }),
    details: jsonb("details").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("audit_entity_idx").on(table.entityType, table.entityId), index("audit_created_idx").on(table.createdAt)],
);
