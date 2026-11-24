-- Migration (BUILD F-9, D9): PostGIS, in its own file before any geography column. Objects live in
-- `extensions`; app SQL calls them schema-qualified because definer functions use search_path ''.
-- Forward-only: never edit once applied anywhere (NFR-19); fix with a new migration.
create extension if not exists postgis with schema extensions;
