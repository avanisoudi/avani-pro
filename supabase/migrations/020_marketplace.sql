-- Marketplace: compatible with the existing production marketplace_listings table.
-- No demo listings and no change to existing feature enable/disable choices.
create table if not exists public.marketplace_listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 160),
  description text,
  price numeric check (price is null or price >= 0),
  currency text not null default 'USD',
  condition text,
  location text,
  status text not null default 'active' check (status in ('active','sold','removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.marketplace_listings add column if not exists category text not null default 'Autres';
alter table public.marketplace_listings add column if not exists photo_path text;
-- Prevent linking another seller's object or an unrelated image into an announcement.
do $$ begin
if not exists (select 1 from pg_constraint where conrelid='public.marketplace_listings'::regclass and conname='marketplace_photo_owner') then
alter table public.marketplace_listings add constraint marketplace_photo_owner check (
  photo_path is null or photo_path like seller_id::text || '/' || id::text || '/%'
);
end if;
end $$;
create index if not exists marketplace_active_recent on public.marketplace_listings(status,created_at desc,id desc);
create index if not exists marketplace_seller on public.marketplace_listings(seller_id,created_at desc);
create index if not exists marketplace_photo_lookup on public.marketplace_listings(photo_path) where photo_path is not null;
alter table public.marketplace_listings enable row level security;
revoke all on public.marketplace_listings from anon;
grant select,insert,update,delete on public.marketplace_listings to authenticated;
drop policy if exists "authenticated read active listings" on public.marketplace_listings;
create policy "authenticated read active listings" on public.marketplace_listings for select to authenticated
using (status='active' or seller_id=(select auth.uid()));
drop policy if exists "users create own listings" on public.marketplace_listings;
create policy "users create own listings" on public.marketplace_listings for insert to authenticated
with check (seller_id=(select auth.uid()));
drop policy if exists "users update own listings" on public.marketplace_listings;
create policy "users update own listings" on public.marketplace_listings for update to authenticated
using (seller_id=(select auth.uid())) with check (seller_id=(select auth.uid()));
drop policy if exists "users delete own listings" on public.marketplace_listings;
create policy "users delete own listings" on public.marketplace_listings for delete to authenticated
using (seller_id=(select auth.uid()));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('marketplace-photos','marketplace-photos',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;
drop policy if exists "marketplace upload own photos" on storage.objects;
create policy "marketplace upload own photos" on storage.objects for insert to authenticated
with check (bucket_id='marketplace-photos' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists "marketplace read visible photos" on storage.objects;
create policy "marketplace read visible photos" on storage.objects for select to authenticated
using (bucket_id='marketplace-photos' and (
  (storage.foldername(name))[1]=(select auth.uid())::text or exists (
    select 1 from public.marketplace_listings l where l.photo_path=name and l.status='active'
  )
));
drop policy if exists "marketplace delete own photos" on storage.objects;
create policy "marketplace delete own photos" on storage.objects for delete to authenticated
using (bucket_id='marketplace-photos' and (storage.foldername(name))[1]=(select auth.uid())::text);
update public.feature_flags set description='Petites annonces, photos, recherche et contact du vendeur.',updated_at=now() where key='marketplace';
