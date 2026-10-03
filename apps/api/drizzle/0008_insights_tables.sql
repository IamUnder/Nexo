CREATE TABLE "insights_activity_daily" (
	"tenant_id" uuid NOT NULL,
	"day" date NOT NULL,
	"kind" text NOT NULL,
	"author_id" uuid NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "insights_activity_daily_tenant_id_day_kind_author_id_pk" PRIMARY KEY("tenant_id","day","kind","author_id")
);
--> statement-breakpoint
CREATE TABLE "insights_deal_facts" (
	"tenant_id" uuid NOT NULL,
	"deal_id" uuid NOT NULL,
	"name" text NOT NULL,
	"account_name" text NOT NULL,
	"owner_id" uuid,
	"pipeline_id" uuid NOT NULL,
	"stage_id" uuid NOT NULL,
	"stage_name" text NOT NULL,
	"probability" integer NOT NULL,
	"amount_cents" bigint NOT NULL,
	"currency" text NOT NULL,
	"status" text NOT NULL,
	"expected_close_on" date,
	"created_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	"stage_changed_at" timestamp with time zone NOT NULL,
	"lost_reason" text,
	"last_event_at" timestamp with time zone NOT NULL,
	CONSTRAINT "insights_deal_facts_tenant_id_deal_id_pk" PRIMARY KEY("tenant_id","deal_id")
);
--> statement-breakpoint
CREATE TABLE "insights_stage_history" (
	"event_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"deal_id" uuid NOT NULL,
	"from_stage_name" text,
	"to_stage_name" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	CONSTRAINT "insights_stage_history_tenant_id_event_id_pk" PRIMARY KEY("tenant_id","event_id")
);
--> statement-breakpoint
ALTER TABLE "insights_activity_daily" ADD CONSTRAINT "insights_activity_daily_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insights_deal_facts" ADD CONSTRAINT "insights_deal_facts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insights_stage_history" ADD CONSTRAINT "insights_stage_history_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "insights_deal_facts_status_idx" ON "insights_deal_facts" USING btree ("tenant_id","status","closed_at");--> statement-breakpoint
CREATE INDEX "insights_deal_facts_owner_idx" ON "insights_deal_facts" USING btree ("tenant_id","owner_id");--> statement-breakpoint
CREATE INDEX "insights_stage_history_deal_idx" ON "insights_stage_history" USING btree ("tenant_id","deal_id","occurred_at");