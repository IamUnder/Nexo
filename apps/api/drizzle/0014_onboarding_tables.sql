CREATE TABLE "onboarding_milestones" (
	"tenant_id" uuid NOT NULL,
	"key" text NOT NULL,
	"reached_at" timestamp with time zone NOT NULL,
	CONSTRAINT "onboarding_milestones_tenant_id_key_pk" PRIMARY KEY("tenant_id","key")
);
--> statement-breakpoint
CREATE TABLE "onboarding_progress" (
	"tenant_id" uuid NOT NULL,
	"dismissed" boolean DEFAULT false NOT NULL,
	"activated_at" timestamp with time zone,
	"imported_total" integer DEFAULT 0 NOT NULL,
	"invited_total" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "onboarding_progress_tenant_id_pk" PRIMARY KEY("tenant_id")
);
--> statement-breakpoint
ALTER TABLE "onboarding_milestones" ADD CONSTRAINT "onboarding_milestones_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_progress" ADD CONSTRAINT "onboarding_progress_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;