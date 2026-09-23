-- ============================================================
-- HOTEND HQ — database schema for Supabase (Postgres)
-- Run this once in: Supabase dashboard -> SQL Editor -> New query
-- It is safe to re-run: everything is IF NOT EXISTS / OR REPLACE.
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- PROFILES ------------------------------------------------
-- One row per signed-up user. Roles: 'reader' | 'editor' | 'admin'
create table if not exists public.profiles (
  id          uuid primary key references auth.users on delete cascade,
  email       text,
  display_name text,
  bio         text,
  avatar_url  text,
  role        text not null default 'reader'
              check (role in ('reader','editor','admin')),
  created_at  timestamptz not null default now()
);

-- ---------- ARTICLES ------------------------------------------------
create table if not exists public.articles (
  id           uuid primary key default gen_random_uuid(),
  slug         text unique not null,
  title        text not null,
  excerpt      text,
  body         text not null default '',           -- markdown
  category     text not null default 'News',
  tags         text[] not null default '{}',
  cover_url    text,
  author_id    uuid references public.profiles(id) on delete set null,
  author_name  text,
  status       text not null default 'draft' check (status in ('draft','published')),
  featured     boolean not null default false,
  views        integer not null default 0,
  published_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists articles_pub_idx  on public.articles (status, published_at desc);
create index if not exists articles_cat_idx  on public.articles (category);
create index if not exists articles_slug_idx on public.articles (slug);

-- ---------- AFFILIATE PRODUCTS ---------------------------------------
create table if not exists public.products (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  brand      text,
  category   text not null default 'Hot Ends',
  blurb      text,
  specs      jsonb not null default '{}'::jsonb,
  asin       text,
  url        text,
  image_url  text,
  price_note text,
  rating     numeric(2,1),
  best_for   text,
  rank       integer not null default 100,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- GENERATOR PRESETS (user-saved / shareable) ---------------
create table if not exists public.saved_configs (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid references public.profiles(id) on delete cascade,
  model_key  text not null,
  name       text not null,
  params     jsonb not null,
  is_public  boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists saved_public_idx on public.saved_configs (model_key, is_public);

-- ---------- NEWSLETTER ------------------------------------------------
create table if not exists public.subscribers (
  id         uuid primary key default gen_random_uuid(),
  email      text unique not null,
  source     text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Helper: is the caller an editor or admin?
-- SECURITY DEFINER so policies can read profiles without recursion.
-- ============================================================
create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('editor','admin')
  );
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- ============================================================
-- New signups get a profile automatically.
-- The VERY FIRST account created becomes the admin — that's you.
-- ============================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare first_user boolean;
begin
  select count(*) = 0 into first_user from public.profiles;
  insert into public.profiles (id, email, display_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1)),
    case when first_user then 'admin' else 'reader' end
  )
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- keep updated_at honest
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
drop trigger if exists articles_touch on public.articles;
create trigger articles_touch before update on public.articles
  for each row execute function public.touch_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table public.profiles      enable row level security;
alter table public.articles      enable row level security;
alter table public.products      enable row level security;
alter table public.saved_configs enable row level security;
alter table public.subscribers   enable row level security;

-- profiles -----------------------------------------------------------
drop policy if exists profiles_read   on public.profiles;
drop policy if exists profiles_update on public.profiles;
create policy profiles_read on public.profiles
  for select using (true);
create policy profiles_update on public.profiles
  for update using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- articles -----------------------------------------------------------
drop policy if exists articles_read   on public.articles;
drop policy if exists articles_insert on public.articles;
drop policy if exists articles_update on public.articles;
drop policy if exists articles_delete on public.articles;
create policy articles_read on public.articles
  for select using (status = 'published' or author_id = auth.uid() or public.is_staff());
create policy articles_insert on public.articles
  for insert with check (public.is_staff() and author_id = auth.uid());
create policy articles_update on public.articles
  for update using (author_id = auth.uid() or public.is_admin())
  with check (author_id = auth.uid() or public.is_admin());
create policy articles_delete on public.articles
  for delete using (author_id = auth.uid() or public.is_admin());

-- products -----------------------------------------------------------
drop policy if exists products_read  on public.products;
drop policy if exists products_write on public.products;
create policy products_read  on public.products for select using (active or public.is_staff());
create policy products_write on public.products for all
  using (public.is_staff()) with check (public.is_staff());

-- saved configs ------------------------------------------------------
drop policy if exists cfg_read   on public.saved_configs;
drop policy if exists cfg_write  on public.saved_configs;
create policy cfg_read on public.saved_configs
  for select using (is_public or owner_id = auth.uid());
create policy cfg_write on public.saved_configs
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- subscribers --------------------------------------------------------
drop policy if exists subs_insert on public.subscribers;
drop policy if exists subs_read   on public.subscribers;
create policy subs_insert on public.subscribers for insert with check (true);
create policy subs_read   on public.subscribers for select using (public.is_admin());

-- ============================================================
-- STORAGE: public bucket for article cover images
-- ============================================================
insert into storage.buckets (id, name, public)
values ('media','media', true)
on conflict (id) do nothing;

drop policy if exists media_read   on storage.objects;
drop policy if exists media_write  on storage.objects;
drop policy if exists media_delete on storage.objects;
create policy media_read on storage.objects
  for select using (bucket_id = 'media');
create policy media_write on storage.objects
  for insert with check (bucket_id = 'media' and public.is_staff());
create policy media_delete on storage.objects
  for delete using (bucket_id = 'media' and public.is_staff());

-- ============================================================
-- Atomic view counter (called from the article page)
-- ============================================================
create or replace function public.bump_views(article_slug text)
returns void language sql security definer set search_path = public as $$
  update public.articles set views = views + 1
  where slug = article_slug and status = 'published';
$$;
grant execute on function public.bump_views(text) to anon, authenticated;
