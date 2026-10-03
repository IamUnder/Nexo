CREATE TABLE "crm_accounts" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"legal_name" text,
	"tax_id" text,
	"domain" text,
	"industry" text,
	"website" text,
	"phone" text,
	"status" text DEFAULT 'prospect' NOT NULL,
	"source" text,
	"notes" text,
	"owner_membership_id" uuid,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crm_accounts_tenant_id_id_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "crm_activities" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"subject" text NOT NULL,
	"body" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"author_membership_id" uuid,
	"account_id" uuid,
	"contact_id" uuid,
	"deal_id" uuid,
	"source" text DEFAULT 'user' NOT NULL,
	"external_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crm_activities_tenant_id_id_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "crm_contacts" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"account_id" uuid,
	"first_name" text NOT NULL,
	"last_name" text,
	"email" text,
	"phone" text,
	"job_title" text,
	"status" text DEFAULT 'lead' NOT NULL,
	"owner_membership_id" uuid,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crm_contacts_tenant_id_id_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "crm_deals" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"account_id" uuid NOT NULL,
	"primary_contact_id" uuid,
	"pipeline_id" uuid NOT NULL,
	"stage_id" uuid NOT NULL,
	"amount_cents" bigint DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"probability" integer DEFAULT 0 NOT NULL,
	"expected_close_on" date,
	"owner_membership_id" uuid,
	"status" text DEFAULT 'open' NOT NULL,
	"lost_reason" text,
	"next_action_at" timestamp with time zone,
	"next_action_text" text,
	"closed_at" timestamp with time zone,
	"stage_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crm_deals_tenant_id_id_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "crm_pipelines" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crm_pipelines_tenant_id_id_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "crm_pipeline_stages" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"pipeline_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL,
	"probability" integer NOT NULL,
	"kind" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crm_stages_tenant_id_id_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "crm_tasks" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"title" text NOT NULL,
	"due_at" timestamp with time zone,
	"status" text DEFAULT 'open' NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"assignee_membership_id" uuid,
	"created_by_membership_id" uuid,
	"account_id" uuid,
	"contact_id" uuid,
	"deal_id" uuid,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crm_tasks_tenant_id_id_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
ALTER TABLE "crm_accounts" ADD CONSTRAINT "crm_accounts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_account_fk" FOREIGN KEY ("tenant_id","account_id") REFERENCES "public"."crm_accounts"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_contact_fk" FOREIGN KEY ("tenant_id","contact_id") REFERENCES "public"."crm_contacts"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_deal_fk" FOREIGN KEY ("tenant_id","deal_id") REFERENCES "public"."crm_deals"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_contacts" ADD CONSTRAINT "crm_contacts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_contacts" ADD CONSTRAINT "crm_contacts_account_fk" FOREIGN KEY ("tenant_id","account_id") REFERENCES "public"."crm_accounts"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_account_fk" FOREIGN KEY ("tenant_id","account_id") REFERENCES "public"."crm_accounts"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_contact_fk" FOREIGN KEY ("tenant_id","primary_contact_id") REFERENCES "public"."crm_contacts"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_pipeline_fk" FOREIGN KEY ("tenant_id","pipeline_id") REFERENCES "public"."crm_pipelines"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_stage_fk" FOREIGN KEY ("tenant_id","stage_id") REFERENCES "public"."crm_pipeline_stages"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_pipelines" ADD CONSTRAINT "crm_pipelines_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_pipeline_stages" ADD CONSTRAINT "crm_pipeline_stages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_pipeline_stages" ADD CONSTRAINT "crm_stages_pipeline_fk" FOREIGN KEY ("tenant_id","pipeline_id") REFERENCES "public"."crm_pipelines"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_account_fk" FOREIGN KEY ("tenant_id","account_id") REFERENCES "public"."crm_accounts"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_contact_fk" FOREIGN KEY ("tenant_id","contact_id") REFERENCES "public"."crm_contacts"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_deal_fk" FOREIGN KEY ("tenant_id","deal_id") REFERENCES "public"."crm_deals"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crm_accounts_tenant_created_idx" ON "crm_accounts" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "crm_accounts_tenant_owner_idx" ON "crm_accounts" USING btree ("tenant_id","owner_membership_id");--> statement-breakpoint
CREATE INDEX "crm_activities_tenant_account_idx" ON "crm_activities" USING btree ("tenant_id","account_id","occurred_at");--> statement-breakpoint
CREATE INDEX "crm_activities_tenant_deal_idx" ON "crm_activities" USING btree ("tenant_id","deal_id","occurred_at");--> statement-breakpoint
CREATE INDEX "crm_activities_tenant_contact_idx" ON "crm_activities" USING btree ("tenant_id","contact_id","occurred_at");--> statement-breakpoint
CREATE INDEX "crm_contacts_tenant_account_idx" ON "crm_contacts" USING btree ("tenant_id","account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_contacts_tenant_email_uq" ON "crm_contacts" USING btree ("tenant_id",lower("email")) WHERE "crm_contacts"."deleted_at" is null and "crm_contacts"."email" is not null;--> statement-breakpoint
CREATE INDEX "crm_deals_tenant_pipeline_status_idx" ON "crm_deals" USING btree ("tenant_id","pipeline_id","status");--> statement-breakpoint
CREATE INDEX "crm_deals_tenant_account_idx" ON "crm_deals" USING btree ("tenant_id","account_id");--> statement-breakpoint
CREATE INDEX "crm_deals_tenant_owner_idx" ON "crm_deals" USING btree ("tenant_id","owner_membership_id");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_pipelines_one_default_uq" ON "crm_pipelines" USING btree ("tenant_id") WHERE "crm_pipelines"."is_default" = true;--> statement-breakpoint
CREATE INDEX "crm_stages_tenant_pipeline_idx" ON "crm_pipeline_stages" USING btree ("tenant_id","pipeline_id","position");--> statement-breakpoint
CREATE INDEX "crm_tasks_tenant_assignee_status_idx" ON "crm_tasks" USING btree ("tenant_id","assignee_membership_id","status","due_at");