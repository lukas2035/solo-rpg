-- Přepínač pravidel pro AI se stěhuje ze hry do scén; stávající scény zůstávají v pokročilém režimu AI.
-- Řádky se starší verzí fields dojedou JS migrací (kinds.ts) – ta už přítomné klíče zachová.
UPDATE "entities" e
SET "fields" = e."fields" || jsonb_build_object('aiMode', 'advanced', 'rulesInAi', g."rules_in_ai"),
    "schema_version" = CASE WHEN e."schema_version" >= 3 THEN 4 ELSE e."schema_version" END
FROM "games" g
WHERE e."game_id" = g."id" AND e."kind" = 'scene';--> statement-breakpoint
ALTER TABLE "games" DROP COLUMN "rules_in_ai";