-- Ztmavení pozadí se stěhuje ze hry do scén (negace dřívějšího `bright_background`).
-- Řádky se starší verzí fields dojedou JS migrací (kinds.ts) – ta už přítomné klíče zachová.
UPDATE "entities" e
SET "fields" = e."fields" || jsonb_build_object('darkBackground', NOT g."bright_background"),
    "schema_version" = CASE WHEN e."schema_version" >= 4 THEN 5 ELSE e."schema_version" END
FROM "games" g
WHERE e."game_id" = g."id" AND e."kind" = 'scene';--> statement-breakpoint
ALTER TABLE "games" DROP COLUMN "bright_background";
