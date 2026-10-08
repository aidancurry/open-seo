CREATE TABLE "rank_serp_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"tracking_keyword_id" text NOT NULL,
	"keyword" text NOT NULL,
	"device" text NOT NULL,
	"position" integer NOT NULL,
	"domain" text NOT NULL,
	"url" text,
	"checked_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rank_serp_results" ADD CONSTRAINT "rank_serp_results_run_id_rank_check_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."rank_check_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "rank_serp_results_run_keyword_device_position_idx" ON "rank_serp_results" USING btree ("run_id","tracking_keyword_id","device","position");--> statement-breakpoint
CREATE INDEX "rank_serp_results_keyword_device_idx" ON "rank_serp_results" USING btree ("tracking_keyword_id","device","checked_at");--> statement-breakpoint
CREATE INDEX "rank_serp_results_domain_idx" ON "rank_serp_results" USING btree ("domain");