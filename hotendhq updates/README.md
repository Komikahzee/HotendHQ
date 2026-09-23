# Hotend HQ — hotendhq.com

A static front end with a real backend behind it. No build step, no framework, no
bundler: every file here is the file that ships. Drop the folder on any static host
and it works; connect Supabase and the accounts, publishing and uploads switch on.

---

## 1. Get it online (5 minutes, free)

**Cloudflare Pages** (recommended — free, fast, free SSL, custom domain):

1. Push this folder to a GitHub repo.
2. Cloudflare dashboard → Workers & Pages → Create → Pages → connect the repo.
3. Build command: *(leave empty)*. Build output directory: `/`.
4. Deploy, then Custom domains → add `hotendhq.com`.

**Netlify** works the same way, or just drag the folder onto app.netlify.com/drop.

`_headers` and `_redirects` are already set up for both (security headers, asset
caching, and a 404 page).

At this point the site is fully live: every article, the troubleshooter, the
generator, the calculators and the gear pages all work. Only accounts and
publishing-from-the-browser need step 2.

---

## 2. Turn on accounts and publishing (10 minutes, free)

1. Create a free project at **supabase.com**.
2. Open **SQL Editor → New query**, paste all of `supabase/schema.sql`, run it.
   That creates the tables, the security policies, the media bucket and the
   trigger that makes **the first account you create the administrator**.
3. **Project Settings → API**: copy the *Project URL* and the *anon public* key.
4. Paste both into `assets/js/config.js`:

   ```js
   supabase: {
     url: 'https://xxxxxxxx.supabase.co',
     anonKey: 'eyJhbGciOi...'
   }
   ```

5. Redeploy. Go to `/login.html`, create your account — you are now the admin.
6. `/admin.html` is the editor: headline, summary, cover image, markdown body,
   live preview, draft or publish.

**Is the anon key safe in the browser?** Yes — that is what it is for. Row Level
Security in `schema.sql` is what protects the data: anonymous visitors can read
published articles and nothing else, and only accounts with the `editor` or
`admin` role can write.

**Adding another writer:** they sign up, then in Supabase → Table Editor →
`profiles`, change their `role` from `reader` to `editor`.

---

## 3. Your affiliate tag

`assets/js/config.js` → `affiliate.amazonTag`. Change it once and **every**
product link on the site rebuilds from it. Nothing else needs editing.

Each item in `assets/js/data-gear.js` links via an Amazon search term, so links
keep working as listings change. Once you have verified a specific product, add
`asin: 'B0XXXXXXX'` to that item and it will link straight to the product page
instead. Links already carry `rel="nofollow sponsored"`, which is what Amazon's
terms and Google both require.

---

## 4. What is where

```
index.html          Homepage — teasers only, no content of its own
news.html           Article index (search + category filter)
article.html        Single article  (article.html?a=slug)
troubleshoot.html   Guided diagnostic + searchable failure database
generator.html      Parametric 3D model generator with STL export
tools.html          Five calculators + the filament database
gear.html           Affiliate picks, grouped by the problem they solve
about.html          About, affiliate disclosure, privacy, contact
login.html          Sign in / sign up
admin.html          Article editor (noindex)
404.html            Not found

assets/css/theme.css    Design system — colours sampled from your logo
assets/css/pages.css    Per-page layout
assets/css/fonts.css    Self-hosted Inter + JetBrains Mono

assets/js/config.js     ← the only file you need to edit
assets/js/nav.js        Site structure. Header, footer and sitemap read from it
assets/js/site.js       Header, footer, shared helpers and the article card
assets/js/api.js        Data layer. Supabase when configured, seed content when not
assets/js/md.js         Markdown renderer (escapes everything before rendering)
assets/js/generator.js  The parametric models and the 3D viewer
assets/js/data-*.js     Content: articles, troubleshooting, gear, filaments
assets/vendor/three/    three.js, self-hosted so the site has no CDN dependency

supabase/schema.sql     Run once. Tables, RLS policies, storage, triggers
```

**No page duplicates another.** Site structure is defined once in `nav.js`. The
affiliate disclosure is one string in `config.js`, shown wherever disclosure is
legally required. The article card markup exists once in `site.js`. The
troubleshooting entries, gear items and filament rows each exist once as data and
are rendered by whichever page needs them.

---

## 5. Adding content without the backend

Anything in `assets/js/data-articles.js` ships with the site and shows up even
with no database connected — useful for content you never want to lose. Database
articles take priority over a bundled article with the same slug, so you can
override one later without deleting it.

The same applies to `data-troubleshoot.js`, `data-gear.js` and
`data-filament.js`: add an entry, redeploy, done.

---

## 6. The generator

Five parametric models — storage box, spool holder, wall bracket, grid organiser,
cable clip — built procedurally with three.js and exported as binary STL. It all
runs in the visitor's browser: nothing is uploaded and nothing is queued.

To add a model, add an entry to `MODELS` in `assets/js/generator.js` with
`params`, optional `toggles`, and a `build()` that returns `{ parts, notes }`.
The picker, the sliders, the STL export and the weight estimate all pick it up
automatically.

Every configuration is shareable: **Copy link** puts the full parameter set in
the URL.

---

## 7. Things worth doing next

- Point `social.youtube` in `config.js` at your channel when it exists.
- Replace `og-image.png` if you want a custom social card per article
  (`cover_url` already does this per-article once you upload covers).
- Add Cloudflare Web Analytics — privacy-friendly, free, one script tag, and it
  will not conflict with the privacy statement on the About page.
- Submit `sitemap.xml` in Google Search Console once the domain is live.
