ALTER TABLE "scene_entries" ADD COLUMN "ai" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "scene_entries" ADD COLUMN "prompt_id" text;