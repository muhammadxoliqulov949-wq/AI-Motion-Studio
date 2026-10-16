-- Public cache for the music library (Kevin MacLeod, CC BY 4.0). The /api/music route copies
-- each track here on first use with the service-role key, then redirects players to it.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('music', 'music', true, 52428800, array['audio/mpeg'])
on conflict (id) do update set public = true;
