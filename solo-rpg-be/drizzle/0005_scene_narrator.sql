-- Vypravěč se stěhuje ze hry (games.current_narrator_id) do scén jako vazba links.kind = 'narrator'.
INSERT INTO "links" ("game_id", "from_id", "to_id", "kind", "position")
SELECT e."game_id", e."id", g."current_narrator_id", 'narrator', 0
FROM "entities" e
JOIN "games" g ON g."id" = e."game_id"
JOIN "entities" n ON n."id" = g."current_narrator_id" AND n."kind" = 'narrator'
WHERE e."kind" = 'scene'
ON CONFLICT DO NOTHING;--> statement-breakpoint
ALTER TABLE "games" DROP COLUMN "current_narrator_id";