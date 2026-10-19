CREATE TABLE "scene_documents" (
	"scene_id" text PRIMARY KEY NOT NULL,
	"game_id" text NOT NULL,
	"doc" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scene_documents" ADD CONSTRAINT "scene_documents_scene_id_entities_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scene_documents" ADD CONSTRAINT "scene_documents_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;