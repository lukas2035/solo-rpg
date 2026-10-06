CREATE TABLE "assets" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text DEFAULT 'local' NOT NULL,
	"game_id" text NOT NULL,
	"kind" text NOT NULL,
	"mime" text NOT NULL,
	"ext" text NOT NULL,
	"size" integer NOT NULL,
	"sha256" text NOT NULL,
	"storage_key" text NOT NULL,
	"original_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entities" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text DEFAULT 'local' NOT NULL,
	"game_id" text NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	"fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"image_asset_id" text,
	"image_url" text,
	"notes" text DEFAULT '' NOT NULL,
	"ai_state" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"tenant_id" text DEFAULT 'local' NOT NULL,
	"game_id" text NOT NULL,
	"scene_id" text,
	"kind" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "games" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text DEFAULT 'local' NOT NULL,
	"name" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"rules" text DEFAULT '' NOT NULL,
	"rules_in_ai" boolean DEFAULT false NOT NULL,
	"bright_background" boolean DEFAULT true NOT NULL,
	"background_asset_id" text,
	"background_url" text,
	"current_narrator_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "links" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "links_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"game_id" text NOT NULL,
	"from_id" text NOT NULL,
	"to_id" text NOT NULL,
	"kind" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scene_entries" (
	"id" text NOT NULL,
	"game_id" text NOT NULL,
	"scene_id" text NOT NULL,
	"position" integer NOT NULL,
	"speaker_kind" text NOT NULL,
	"speaker_id" text,
	"speaker_name" text,
	"text" text NOT NULL,
	"markdown" boolean DEFAULT false NOT NULL,
	"timestamp" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "links" ADD CONSTRAINT "links_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "links" ADD CONSTRAINT "links_from_id_entities_id_fk" FOREIGN KEY ("from_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "links" ADD CONSTRAINT "links_to_id_entities_id_fk" FOREIGN KEY ("to_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scene_entries" ADD CONSTRAINT "scene_entries_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scene_entries" ADD CONSTRAINT "scene_entries_scene_id_entities_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scene_entries" ADD CONSTRAINT "scene_entries_speaker_id_entities_id_fk" FOREIGN KEY ("speaker_id") REFERENCES "public"."entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assets_game_idx" ON "assets" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "entities_game_kind_idx" ON "entities" USING btree ("game_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "entities_game_kind_name_idx" ON "entities" USING btree ("game_id","kind",lower("name"));--> statement-breakpoint
CREATE INDEX "events_game_created_idx" ON "events" USING btree ("game_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "games_tenant_name_idx" ON "games" USING btree ("tenant_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "links_from_kind_to_idx" ON "links" USING btree ("from_id","kind","to_id");--> statement-breakpoint
CREATE INDEX "links_to_idx" ON "links" USING btree ("to_id");--> statement-breakpoint
CREATE UNIQUE INDEX "scene_entries_scene_id_idx" ON "scene_entries" USING btree ("scene_id","id");--> statement-breakpoint
CREATE INDEX "scene_entries_scene_pos_idx" ON "scene_entries" USING btree ("scene_id","position");