-- AI Motion Studio: cloud projects + private media storage.
-- Run once in the Supabase dashboard (SQL Editor) or with `supabase db push`.

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null default 'Yangi loyiha',
  aspect text not null default '16:9',
  duration real not null default 0,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists projects_user_updated_idx on public.projects (user_id, updated_at desc);

alter table public.projects enable row level security;

drop policy if exists "projects: owner can read" on public.projects;
create policy "projects: owner can read" on public.projects
  for select using (auth.uid() = user_id);

drop policy if exists "projects: owner can insert" on public.projects;
create policy "projects: owner can insert" on public.projects
  for insert with check (auth.uid() = user_id);

drop policy if exists "projects: owner can update" on public.projects;
create policy "projects: owner can update" on public.projects
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "projects: owner can delete" on public.projects;
create policy "projects: owner can delete" on public.projects
  for delete using (auth.uid() = user_id);

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists projects_touch on public.projects;
create trigger projects_touch before update on public.projects
  for each row execute function public.touch_updated_at();

-- Private bucket for uploaded footage / voiceovers: objects live under "<user id>/...".
insert into storage.buckets (id, name, public, file_size_limit)
values ('media', 'media', false, 524288000)
on conflict (id) do nothing;

drop policy if exists "media: owner can read" on storage.objects;
create policy "media: owner can read" on storage.objects
  for select using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "media: owner can upload" on storage.objects;
create policy "media: owner can upload" on storage.objects
  for insert with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "media: owner can update" on storage.objects;
create policy "media: owner can update" on storage.objects
  for update using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "media: owner can delete" on storage.objects;
create policy "media: owner can delete" on storage.objects
  for delete using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
