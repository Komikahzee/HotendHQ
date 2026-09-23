-- ============================================================
-- Hotend HQ — rebuild the site when an article changes
--
-- Publishing, editing or unpublishing an article in /admin calls the
-- Cloudflare deploy hook, which rebuilds /guides/<slug>/ pages and the
-- sitemap. Draft-only edits and view-counter bumps do NOT trigger it.
--
-- 1. Cloudflare: Workers & Pages → hotendhq → Settings → Builds →
--    Deploy Hooks → create one for branch "main", copy the URL.
-- 2. Paste that URL below where it says PASTE_DEPLOY_HOOK_URL_HERE.
-- 3. Run this whole file in Supabase → SQL Editor. Safe to re-run.
--
-- Keep the hook URL private: anyone who has it can trigger builds.
-- ============================================================
create extension if not exists pg_net with schema extensions;

create or replace function public.rebuild_site()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare
  hook constant text := 'PASTE_DEPLOY_HOOK_URL_HERE';
  was_live boolean := tg_op <> 'INSERT' and old.status = 'published';
  is_live  boolean := tg_op <> 'DELETE' and new.status = 'published';
begin
  if not (was_live or is_live) then return null; end if;          -- drafts only
  if tg_op = 'UPDATE' and
     (new.slug, new.title, new.excerpt, new.body, new.category, new.tags, new.cover_url, new.status,
      new.featured, new.published_at, new.author_name, new.seo_title, new.meta_description)
     is not distinct from
     (old.slug, old.title, old.excerpt, old.body, old.category, old.tags, old.cover_url, old.status,
      old.featured, old.published_at, old.author_name, old.seo_title, old.meta_description)
  then return null; end if;                                         -- e.g. view counter only
  perform net.http_post(url := hook, body := '{}'::jsonb);
  return null;
end $$;

drop trigger if exists articles_rebuild on public.articles;
create trigger articles_rebuild
  after insert or update or delete on public.articles
  for each row execute function public.rebuild_site();
