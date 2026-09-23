/* ============================================================
   HOTEND HQ — edge worker
   Only runs for the old article URLs (see run_worker_first in
   wrangler.jsonc); every other request is served straight from the
   static assets without touching this code.

   /article.html?a=<slug>  →  301  /guides/<slug>/
   /article?a=<slug>       →  301  /guides/<slug>/

   If the guide page has not been built yet (an article published a
   minute ago, or a draft preview), the live renderer is served
   instead so the link still works while the rebuild runs.
   ============================================================ */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const slug = (url.searchParams.get('a') || '').trim().toLowerCase();

    if (!slug) return Response.redirect(`${url.origin}/news`, 301);

    if (/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      const target = `${url.origin}/guides/${slug}/`;
      const built = await env.ASSETS.fetch(new Request(target, { method: 'GET' }));
      if (built.status === 200) return Response.redirect(target, 301);
    }

    // Not built (yet): serve the client-side renderer at the clean path.
    // Fetching /article (not /article.html) avoids the asset layer's .html → clean redirect.
    return env.ASSETS.fetch(new Request(`${url.origin}/article${url.search}`, request));
  },
};
