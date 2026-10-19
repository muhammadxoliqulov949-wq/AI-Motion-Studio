-- Temporary public bucket for start frames of AI video generation. /api/gen/video parks the user's
-- image here with the service-role key so the video provider can fetch it by URL, then deletes it
-- right after the request. Objects are unguessable and live for minutes at most.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gen-temp', 'gen-temp', true, 6291456, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true;
