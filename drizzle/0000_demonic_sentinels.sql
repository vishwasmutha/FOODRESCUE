CREATE TYPE "public"."data_source" AS ENUM('SYNTHETIC', 'USER_ENTERED', 'CSV_IMPORT', 'MODEL');--> statement-breakpoint
CREATE TYPE "public"."donation_status" AS ENUM('PREDICTED', 'DRAFT', 'AVAILABLE', 'OFFERED', 'ACCEPTED', 'PICKUP_IN_PROGRESS', 'COMPLETED', 'PARTIALLY_COMPLETED', 'REJECTED', 'CANCELLED', 'EXPIRED', 'UNSAFE', 'FAILED_PICKUP');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('QUEUED', 'DELIVERED', 'READ', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."offer_status" AS ENUM('PENDING', 'ACCEPTED', 'PARTIAL', 'REJECTED', 'EXPIRED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."pickup_status" AS ENUM('SCHEDULED', 'IN_PROGRESS', 'HANDED_OVER', 'RECEIVED', 'FAILED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."reservation_status" AS ENUM('ACTIVE', 'FULFILLED', 'RELEASED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."urgency_status" AS ENUM('NORMAL', 'TIME_SENSITIVE', 'URGENT', 'EXPIRED', 'MANUAL_REVIEW');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('BUSINESS', 'NGO', 'ADMIN');--> statement-breakpoint
CREATE TYPE "public"."verification_status" AS ENUM('PENDING', 'VERIFIED', 'SUSPENDED');--> statement-breakpoint
CREATE TABLE "actual_surplus" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prediction_id" uuid,
	"business_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"observation_date" date NOT NULL,
	"actual_surplus_kg" real NOT NULL,
	"safe_donation_kg" real,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"action" varchar(100) NOT NULL,
	"entity_type" varchar(80) NOT NULL,
	"entity_id" varchar(100),
	"ip_address" varchar(64),
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "businesses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" varchar(180) NOT NULL,
	"business_type" varchar(80) NOT NULL,
	"description" text,
	"address" text NOT NULL,
	"city" varchar(100) DEFAULT 'Bengaluru' NOT NULL,
	"latitude" real,
	"longitude" real,
	"verification_status" "verification_status" DEFAULT 'PENDING' NOT NULL,
	"default_pickup_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "businesses_owner_id_unique" UNIQUE("owner_id")
);
--> statement-breakpoint
CREATE TABLE "donation_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"donation_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"name" varchar(180) NOT NULL,
	"quantity_kg" real NOT NULL,
	"dietary_tags" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"allergen_notes" text,
	CONSTRAINT "donation_item_quantity_positive" CHECK ("donation_items"."quantity_kg" > 0)
);
--> statement-breakpoint
CREATE TABLE "donation_offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"donation_id" uuid NOT NULL,
	"ngo_id" uuid NOT NULL,
	"offered_quantity_kg" real NOT NULL,
	"status" "offer_status" DEFAULT 'PENDING' NOT NULL,
	"match_score" real NOT NULL,
	"score_breakdown" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"recommendation_reason" text,
	"expires_at" timestamp with time zone NOT NULL,
	"idempotency_key" varchar(120),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	CONSTRAINT "offer_quantity_positive" CHECK ("donation_offers"."offered_quantity_kg" > 0)
);
--> statement-breakpoint
CREATE TABLE "donations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_id" varchar(24) NOT NULL,
	"business_id" uuid NOT NULL,
	"prediction_id" uuid,
	"title" varchar(180) NOT NULL,
	"description" text NOT NULL,
	"extracted_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "donation_status" DEFAULT 'DRAFT' NOT NULL,
	"urgency" "urgency_status" DEFAULT 'MANUAL_REVIEW' NOT NULL,
	"total_quantity_kg" real NOT NULL,
	"reserved_quantity_kg" real DEFAULT 0 NOT NULL,
	"completed_quantity_kg" real DEFAULT 0 NOT NULL,
	"available_from" timestamp with time zone NOT NULL,
	"pickup_deadline" timestamp with time zone NOT NULL,
	"preparation_time" timestamp with time zone,
	"storage_condition" varchar(80),
	"packaging_condition" varchar(100),
	"dietary_tags" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"safety_reviewed" boolean DEFAULT false NOT NULL,
	"safety_notes" text,
	"latitude" real,
	"longitude" real,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "donations_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "donation_quantity_valid" CHECK ("donations"."total_quantity_kg" > 0 AND "donations"."reserved_quantity_kg" >= 0 AND "donations"."completed_quantity_kg" >= 0 AND "donations"."reserved_quantity_kg" <= "donations"."total_quantity_kg" AND "donations"."completed_quantity_kg" <= "donations"."total_quantity_kg"),
	CONSTRAINT "donation_window_valid" CHECK ("donations"."pickup_deadline" > "donations"."available_from")
);
--> statement-breakpoint
CREATE TABLE "food_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"description" text,
	"default_handling_notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "food_categories_name_unique" UNIQUE("name"),
	CONSTRAINT "food_categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "model_evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_version_id" uuid NOT NULL,
	"split_strategy" varchar(120) NOT NULL,
	"evaluated_samples" integer NOT NULL,
	"mae" real,
	"rmse" real,
	"baseline_mae" real,
	"baseline_rmse" real,
	"metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"evaluated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(140) NOT NULL,
	"version" varchar(40) NOT NULL,
	"model_type" varchar(60) NOT NULL,
	"status" varchar(40) DEFAULT 'VALIDATED_DEMO' NOT NULL,
	"training_source" "data_source" DEFAULT 'SYNTHETIC' NOT NULL,
	"feature_schema" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"training_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"artifact_path" text,
	"trained_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ngo_accepted_categories" (
	"ngo_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"priority" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "ngo_accepted_categories_ngo_id_category_id_pk" PRIMARY KEY("ngo_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "ngo_operating_hours" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ngo_id" uuid NOT NULL,
	"day_of_week" integer NOT NULL,
	"opens_at" time NOT NULL,
	"closes_at" time NOT NULL,
	"pickup_available" boolean DEFAULT true NOT NULL,
	CONSTRAINT "valid_day_of_week" CHECK ("ngo_operating_hours"."day_of_week" BETWEEN 0 AND 6)
);
--> statement-breakpoint
CREATE TABLE "ngos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" varchar(180) NOT NULL,
	"registration_number" varchar(100),
	"description" text,
	"requirements_text" text,
	"address" text NOT NULL,
	"city" varchar(100) DEFAULT 'Bengaluru' NOT NULL,
	"latitude" real,
	"longitude" real,
	"max_capacity_kg" real DEFAULT 25 NOT NULL,
	"current_capacity_kg" real DEFAULT 25 NOT NULL,
	"max_travel_distance_km" real DEFAULT 12 NOT NULL,
	"min_remaining_shelf_life_minutes" integer DEFAULT 60 NOT NULL,
	"has_transport" boolean DEFAULT true NOT NULL,
	"accepts_partial" boolean DEFAULT true NOT NULL,
	"storage_capabilities" text[] DEFAULT ARRAY['AMBIENT']::text[] NOT NULL,
	"dietary_preferences" text[] DEFAULT ARRAY['VEGETARIAN']::text[] NOT NULL,
	"verification_status" "verification_status" DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ngos_owner_id_unique" UNIQUE("owner_id"),
	CONSTRAINT "ngos_capacity_nonnegative" CHECK ("ngos"."current_capacity_kg" >= 0 AND "ngos"."max_capacity_kg" >= "ngos"."current_capacity_kg")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" varchar(60) NOT NULL,
	"title" varchar(180) NOT NULL,
	"message" text NOT NULL,
	"action_url" text,
	"status" "notification_status" DEFAULT 'DELIVERED' NOT NULL,
	"attempts" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"delivered_at" timestamp with time zone DEFAULT now(),
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offer_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"offer_id" uuid NOT NULL,
	"responder_id" uuid NOT NULL,
	"action" varchar(40) NOT NULL,
	"requested_quantity_kg" real,
	"message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pickup_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reservation_id" uuid NOT NULL,
	"status" "pickup_status" DEFAULT 'SCHEDULED' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"handover_at" timestamp with time zone,
	"received_at" timestamp with time zone,
	"handed_over_quantity_kg" real,
	"donor_confirmation_code" varchar(12),
	"recipient_confirmation_code" varchar(12),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pickup_records_reservation_id_unique" UNIQUE("reservation_id")
);
--> statement-breakpoint
CREATE TABLE "reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"offer_id" uuid NOT NULL,
	"donation_id" uuid NOT NULL,
	"ngo_id" uuid NOT NULL,
	"quantity_kg" real NOT NULL,
	"status" "reservation_status" DEFAULT 'ACTIVE' NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reservations_offer_id_unique" UNIQUE("offer_id"),
	CONSTRAINT "reservation_quantity_positive" CHECK ("reservations"."quantity_kg" > 0)
);
--> statement-breakpoint
CREATE TABLE "sales_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"business_date" date NOT NULL,
	"prepared_kg" real NOT NULL,
	"sold_kg" real NOT NULL,
	"leftover_kg" real NOT NULL,
	"safe_donation_kg" real,
	"order_count" integer,
	"reservations" integer,
	"discount_percent" real DEFAULT 0 NOT NULL,
	"promotion_active" boolean DEFAULT false NOT NULL,
	"holiday_or_festival" varchar(100),
	"weather_summary" varchar(100),
	"source" "data_source" DEFAULT 'USER_ENTERED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sales_quantities_nonnegative" CHECK ("sales_history"."prepared_kg" >= 0 AND "sales_history"."sold_kg" >= 0 AND "sales_history"."leftover_kg" >= 0)
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "surplus_predictions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"model_version_id" uuid,
	"forecast_date" date NOT NULL,
	"predicted_prepared_kg" real NOT NULL,
	"predicted_demand_kg" real NOT NULL,
	"predicted_surplus_kg" real NOT NULL,
	"lower_bound_kg" real,
	"upper_bound_kg" real,
	"confidence" real,
	"important_factors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_fallback" boolean DEFAULT true NOT NULL,
	"source" "data_source" DEFAULT 'MODEL' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_settings" (
	"key" varchar(120) PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"description" text,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"donation_id" uuid,
	"prediction_id" uuid,
	"rating" integer,
	"type" varchar(60) NOT NULL,
	"comments" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feedback_rating_range" CHECK ("user_feedback"."rating" IS NULL OR "user_feedback"."rating" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(320) NOT NULL,
	"password_hash" text NOT NULL,
	"name" varchar(160) NOT NULL,
	"role" "user_role" NOT NULL,
	"phone" varchar(24),
	"timezone" varchar(80) DEFAULT 'Asia/Kolkata' NOT NULL,
	"locale" varchar(10) DEFAULT 'en-IN' NOT NULL,
	"notification_preferences" jsonb DEFAULT '{"inApp":true,"email":false,"urgentOnly":false}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "actual_surplus" ADD CONSTRAINT "actual_surplus_prediction_id_surplus_predictions_id_fk" FOREIGN KEY ("prediction_id") REFERENCES "public"."surplus_predictions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actual_surplus" ADD CONSTRAINT "actual_surplus_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actual_surplus" ADD CONSTRAINT "actual_surplus_category_id_food_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."food_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donation_items" ADD CONSTRAINT "donation_items_donation_id_donations_id_fk" FOREIGN KEY ("donation_id") REFERENCES "public"."donations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donation_items" ADD CONSTRAINT "donation_items_category_id_food_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."food_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donation_offers" ADD CONSTRAINT "donation_offers_donation_id_donations_id_fk" FOREIGN KEY ("donation_id") REFERENCES "public"."donations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donation_offers" ADD CONSTRAINT "donation_offers_ngo_id_ngos_id_fk" FOREIGN KEY ("ngo_id") REFERENCES "public"."ngos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donations" ADD CONSTRAINT "donations_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donations" ADD CONSTRAINT "donations_prediction_id_surplus_predictions_id_fk" FOREIGN KEY ("prediction_id") REFERENCES "public"."surplus_predictions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_evaluations" ADD CONSTRAINT "model_evaluations_model_version_id_model_versions_id_fk" FOREIGN KEY ("model_version_id") REFERENCES "public"."model_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ngo_accepted_categories" ADD CONSTRAINT "ngo_accepted_categories_ngo_id_ngos_id_fk" FOREIGN KEY ("ngo_id") REFERENCES "public"."ngos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ngo_accepted_categories" ADD CONSTRAINT "ngo_accepted_categories_category_id_food_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."food_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ngo_operating_hours" ADD CONSTRAINT "ngo_operating_hours_ngo_id_ngos_id_fk" FOREIGN KEY ("ngo_id") REFERENCES "public"."ngos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ngos" ADD CONSTRAINT "ngos_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_responses" ADD CONSTRAINT "offer_responses_offer_id_donation_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."donation_offers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_responses" ADD CONSTRAINT "offer_responses_responder_id_users_id_fk" FOREIGN KEY ("responder_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickup_records" ADD CONSTRAINT "pickup_records_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_offer_id_donation_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."donation_offers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_donation_id_donations_id_fk" FOREIGN KEY ("donation_id") REFERENCES "public"."donations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_ngo_id_ngos_id_fk" FOREIGN KEY ("ngo_id") REFERENCES "public"."ngos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_history" ADD CONSTRAINT "sales_history_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_history" ADD CONSTRAINT "sales_history_category_id_food_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."food_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "surplus_predictions" ADD CONSTRAINT "surplus_predictions_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "surplus_predictions" ADD CONSTRAINT "surplus_predictions_category_id_food_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."food_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "surplus_predictions" ADD CONSTRAINT "surplus_predictions_model_version_id_model_versions_id_fk" FOREIGN KEY ("model_version_id") REFERENCES "public"."model_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_feedback" ADD CONSTRAINT "user_feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_feedback" ADD CONSTRAINT "user_feedback_donation_id_donations_id_fk" FOREIGN KEY ("donation_id") REFERENCES "public"."donations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_feedback" ADD CONSTRAINT "user_feedback_prediction_id_surplus_predictions_id_fk" FOREIGN KEY ("prediction_id") REFERENCES "public"."surplus_predictions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "actual_surplus_unique" ON "actual_surplus" USING btree ("business_id","category_id","observation_date");--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_created_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "businesses_verification_idx" ON "businesses" USING btree ("verification_status");--> statement-breakpoint
CREATE INDEX "donation_items_donation_idx" ON "donation_items" USING btree ("donation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "offer_donation_ngo_unique" ON "donation_offers" USING btree ("donation_id","ngo_id");--> statement-breakpoint
CREATE UNIQUE INDEX "offer_idempotency_unique" ON "donation_offers" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "offers_ngo_status_idx" ON "donation_offers" USING btree ("ngo_id","status");--> statement-breakpoint
CREATE INDEX "donations_status_deadline_idx" ON "donations" USING btree ("status","pickup_deadline");--> statement-breakpoint
CREATE INDEX "donations_business_idx" ON "donations" USING btree ("business_id","created_at");--> statement-breakpoint
CREATE INDEX "model_evaluations_version_idx" ON "model_evaluations" USING btree ("model_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "model_name_version_unique" ON "model_versions" USING btree ("name","version");--> statement-breakpoint
CREATE INDEX "ngo_hours_lookup_idx" ON "ngo_operating_hours" USING btree ("ngo_id","day_of_week");--> statement-breakpoint
CREATE INDEX "ngos_verification_idx" ON "ngos" USING btree ("verification_status");--> statement-breakpoint
CREATE INDEX "ngos_location_idx" ON "ngos" USING btree ("city");--> statement-breakpoint
CREATE INDEX "notifications_user_status_idx" ON "notifications" USING btree ("user_id","status","created_at");--> statement-breakpoint
CREATE INDEX "offer_responses_offer_idx" ON "offer_responses" USING btree ("offer_id");--> statement-breakpoint
CREATE INDEX "pickups_status_idx" ON "pickup_records" USING btree ("status");--> statement-breakpoint
CREATE INDEX "reservations_donation_status_idx" ON "reservations" USING btree ("donation_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_business_category_date_unique" ON "sales_history" USING btree ("business_id","category_id","business_date");--> statement-breakpoint
CREATE INDEX "sales_chronological_idx" ON "sales_history" USING btree ("business_id","business_date");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expiry_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "prediction_unique" ON "surplus_predictions" USING btree ("business_id","category_id","forecast_date");--> statement-breakpoint
CREATE INDEX "prediction_date_idx" ON "surplus_predictions" USING btree ("forecast_date");--> statement-breakpoint
CREATE INDEX "feedback_type_idx" ON "user_feedback" USING btree ("type");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role");