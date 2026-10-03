CREATE TABLE "delivery_milestones" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"due_on" date,
	"status" text DEFAULT 'pending' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_milestones_tenant_id_id_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "delivery_projects" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"health" text DEFAULT 'on_track' NOT NULL,
	"account_id" uuid,
	"account_name" text,
	"account_archived" boolean DEFAULT false NOT NULL,
	"source_deal_id" uuid,
	"owner_membership_id" uuid,
	"starts_on" date,
	"due_on" date,
	"summary" text,
	"is_sample" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_projects_tenant_id_id_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "delivery_tasks" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"milestone_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'todo' NOT NULL,
	"assignee_membership_id" uuid,
	"due_on" date,
	"position" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_tasks_tenant_id_id_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "delivery_time_entries" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"task_id" uuid,
	"membership_id" uuid,
	"minutes" integer NOT NULL,
	"worked_on" date NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "delivery_milestones" ADD CONSTRAINT "delivery_milestones_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_milestones" ADD CONSTRAINT "delivery_milestones_project_fk" FOREIGN KEY ("tenant_id","project_id") REFERENCES "public"."delivery_projects"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_projects" ADD CONSTRAINT "delivery_projects_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_tasks" ADD CONSTRAINT "delivery_tasks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_tasks" ADD CONSTRAINT "delivery_tasks_project_fk" FOREIGN KEY ("tenant_id","project_id") REFERENCES "public"."delivery_projects"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_tasks" ADD CONSTRAINT "delivery_tasks_milestone_fk" FOREIGN KEY ("tenant_id","milestone_id") REFERENCES "public"."delivery_milestones"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_time_entries" ADD CONSTRAINT "delivery_time_entries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_time_entries" ADD CONSTRAINT "delivery_time_project_fk" FOREIGN KEY ("tenant_id","project_id") REFERENCES "public"."delivery_projects"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_time_entries" ADD CONSTRAINT "delivery_time_task_fk" FOREIGN KEY ("tenant_id","task_id") REFERENCES "public"."delivery_tasks"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "delivery_milestones_project_idx" ON "delivery_milestones" USING btree ("tenant_id","project_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_projects_source_deal_uq" ON "delivery_projects" USING btree ("tenant_id","source_deal_id") WHERE "delivery_projects"."source_deal_id" is not null;--> statement-breakpoint
CREATE INDEX "delivery_projects_tenant_account_idx" ON "delivery_projects" USING btree ("tenant_id","account_id");--> statement-breakpoint
CREATE INDEX "delivery_projects_tenant_status_idx" ON "delivery_projects" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "delivery_tasks_project_idx" ON "delivery_tasks" USING btree ("tenant_id","project_id","position");--> statement-breakpoint
CREATE INDEX "delivery_time_project_idx" ON "delivery_time_entries" USING btree ("tenant_id","project_id","worked_on");