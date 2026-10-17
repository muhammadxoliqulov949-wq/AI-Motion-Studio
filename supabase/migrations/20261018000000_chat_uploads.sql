-- AI Motion Studio: temporary storage for files attached in the AI chat.
-- Private bucket, one folder per user (<user id>/...). The editor deletes a user's files older than
-- 24 hours whenever they open the chat (see cleanupChatUploads in src/editor/cloud.ts).
-- Run once in the Supabase dashboard (SQL Editor) or with `supabase db push`.

insert into storage.buckets (id, name, public, file_size_limit)
values ('chat-temp', 'chat-temp', false, 209715200)
on conflict (id) do nothing;

drop policy if exists "chat-temp: owner can read" on storage.objects;
create policy "chat-temp: owner can read" on storage.objects
  for select using (bucket_id = 'chat-temp' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "chat-temp: owner can upload" on storage.objects;
create policy "chat-temp: owner can upload" on storage.objects
  for insert with check (bucket_id = 'chat-temp' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "chat-temp: owner can delete" on storage.objects;
create policy "chat-temp: owner can delete" on storage.objects
  for delete using (bucket_id = 'chat-temp' and (storage.foldername(name))[1] = auth.uid()::text);
