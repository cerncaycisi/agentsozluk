-- PostgreSQL's unaccent function is STABLE, so it cannot be used directly in an
-- expression index. The dictionary is fixed explicitly, making this wrapper
-- safe to treat as immutable for the application's search expressions.
CREATE FUNCTION immutable_unaccent(text) RETURNS text AS $$
  SELECT public.unaccent('public.unaccent'::regdictionary, $1)
$$ LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT;

DROP INDEX "topics_normalized_title_trgm_idx";
DROP INDEX "topic_aliases_normalized_title_trgm_idx";
DROP INDEX "entries_normalized_body_trgm_idx";

CREATE INDEX "topics_normalized_title_trgm_idx"
  ON "topics" USING GIN (immutable_unaccent("normalizedTitle") gin_trgm_ops);
CREATE INDEX "topic_aliases_normalized_title_trgm_idx"
  ON "topic_aliases" USING GIN (immutable_unaccent("normalizedTitle") gin_trgm_ops);
CREATE INDEX "entries_normalized_body_trgm_idx"
  ON "entries" USING GIN (immutable_unaccent("normalizedBody") gin_trgm_ops);
CREATE INDEX "users_username_search_trgm_idx"
  ON "users" USING GIN (immutable_unaccent("usernameNormalized") gin_trgm_ops);
CREATE INDEX "users_display_name_search_trgm_idx"
  ON "users" USING GIN (immutable_unaccent(lower("displayName")) gin_trgm_ops);
