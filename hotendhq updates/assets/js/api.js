/* ============================================================
   HOTEND HQ — data layer.
   One API for the whole site. If Supabase credentials are present
   in config.js it talks to the database; if not, it runs on the
   bundled seed content plus a local draft store so every page still
   works and the admin tools are still explorable.
   ============================================================ */
(function () {
  const CFG = window.HHQ_CONFIG;
  const LIVE = !!(CFG.supabase.url && CFG.supabase.anonKey);
  const LS_KEY = 'hhq.local.articles';

  let sb = null;
  let currentUser = null, currentProfile = null;

  /* ---------- local (no-backend) store ---------- */
  const local = {
    read(){ try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; } },
    write(a){ try { localStorage.setItem(LS_KEY, JSON.stringify(a)); return true; } catch { return false; } }
  };

  function seedRows(){
    return (window.HHQ_SEED_ARTICLES || []).map(a => Object.assign({
      id:'seed-' + a.slug, status:'published', views:0, seed:true, featured:false, tags:[]
    }, a));
  }

  /** Seed + locally-saved articles, newest first, de-duplicated by slug. */
  function offlineAll(){
    const bySlug = new Map();
    seedRows().forEach(r => bySlug.set(r.slug, r));
    local.read().forEach(r => bySlug.set(r.slug, r));   // local edits win
    return [...bySlug.values()].sort((a,b) =>
      new Date(b.published_at || b.created_at || 0) - new Date(a.published_at || a.created_at || 0));
  }

  /* ---------- boot ---------- */
  const ready = (async () => {
    if (!LIVE) return { live:false };
    try {
      const mod = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
      sb = mod.createClient(CFG.supabase.url, CFG.supabase.anonKey);
      const { data } = await sb.auth.getSession();
      await setUser(data?.session?.user || null);
      sb.auth.onAuthStateChange((_e, s) => setUser(s?.user || null));
      return { live:true };
    } catch (err) {
      console.warn('[HotendHQ] Backend unavailable, running on bundled content.', err);
      sb = null;
      return { live:false, error:err };
    }
  })();

  async function setUser(u){
    currentUser = u;
    currentProfile = null;
    if (u && sb) {
      const { data } = await sb.from('profiles').select('*').eq('id', u.id).maybeSingle();
      currentProfile = data || null;
    }
    window.dispatchEvent(new CustomEvent('hhq:auth',
      { detail:{ user:currentUser, profile:currentProfile } }));
  }

  /* ---------- public API ---------- */
  window.HHQ_API = {
    ready,
    get isLive(){ return !!sb; },
    get user(){ return currentUser; },
    get profile(){ return currentProfile; },
    get isStaff(){ return !!currentProfile && ['editor','admin'].includes(currentProfile.role); },
    get isAdmin(){ return currentProfile?.role === 'admin'; },

    /* ----- auth ----- */
    async signUp(email, password, displayName){
      if (!sb) throw new Error('Connect a backend in assets/js/config.js to create accounts.');
      const { data, error } = await sb.auth.signUp({
        email, password, options:{ data:{ display_name: displayName || email.split('@')[0] } }
      });
      if (error) throw error;
      return data;
    },
    async signIn(email, password){
      if (!sb) throw new Error('Connect a backend in assets/js/config.js to sign in.');
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await setUser(data.user);
      return data;
    },
    async resetPassword(email){
      if (!sb) throw new Error('Connect a backend in assets/js/config.js first.');
      const { error } = await sb.auth.resetPasswordForEmail(email,
        { redirectTo: location.origin + '/login.html' });
      if (error) throw error;
    },
    async signOut(){ if (sb) await sb.auth.signOut(); await setUser(null); },

    /* ----- articles ----- */
    async listArticles({ category, limit = 50, includeDrafts = false } = {}){
      await ready;
      if (!sb) {
        let rows = offlineAll();
        if (!includeDrafts) rows = rows.filter(r => r.status === 'published');
        if (category && category !== 'All') rows = rows.filter(r => r.category === category);
        return rows.slice(0, limit);
      }
      let q = sb.from('articles').select('*').order('published_at',{ ascending:false, nullsFirst:false }).limit(limit);
      if (!includeDrafts) q = q.eq('status','published');
      if (category && category !== 'All') q = q.eq('category', category);
      const { data, error } = await q;
      if (error) throw error;
      // Seed content fills in behind anything the database returns.
      const bySlug = new Map();
      seedRows().filter(r => !category || category === 'All' || r.category === category)
                .forEach(r => bySlug.set(r.slug, r));
      (data || []).forEach(r => bySlug.set(r.slug, r));
      return [...bySlug.values()]
        .sort((a,b) => new Date(b.published_at||0) - new Date(a.published_at||0))
        .slice(0, limit);
    },

    async getArticle(slug){
      await ready;
      if (sb) {
        const { data } = await sb.from('articles').select('*').eq('slug', slug).maybeSingle();
        if (data) { sb.rpc('bump_views',{ article_slug: slug }).then(()=>{}, ()=>{}); return data; }
      }
      return offlineAll().find(a => a.slug === slug) || null;
    },

    async saveArticle(row){
      await ready;
      const now = new Date().toISOString();
      const clean = {
        slug: row.slug, title: row.title, excerpt: row.excerpt || '',
        body: row.body || '', category: row.category || 'News',
        tags: row.tags || [], cover_url: row.cover_url || null,
        status: row.status || 'draft', featured: !!row.featured,
        published_at: row.status === 'published' ? (row.published_at || now) : null
      };
      if (!sb) {
        const rows = local.read().filter(r => r.slug !== clean.slug);
        rows.push(Object.assign({ id:'local-'+clean.slug, created_at:now,
          author_name:'Local draft', local:true }, clean));
        if (!local.write(rows)) throw new Error('This browser is blocking local storage, so the draft could not be kept.');
        return clean;
      }
      if (!this.isStaff) throw new Error('Your account does not have publishing rights yet.');
      clean.author_id = currentUser.id;
      clean.author_name = currentProfile?.display_name || currentUser.email.split('@')[0];
      const { data, error } = await sb.from('articles')
        .upsert(clean, { onConflict:'slug' }).select().single();
      if (error) throw error;
      return data;
    },

    async deleteArticle(slug){
      await ready;
      if (!sb) { local.write(local.read().filter(r => r.slug !== slug)); return; }
      const { error } = await sb.from('articles').delete().eq('slug', slug);
      if (error) throw error;
    },

    async uploadImage(file){
      await ready;
      if (!sb) return await new Promise((res, rej) => {
        if (file.size > 900000) return rej(new Error('Without a backend, images must be under ~900 KB.'));
        const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej;
        r.readAsDataURL(file);
      });
      const path = `covers/${Date.now()}-${HHQ.slug(file.name.replace(/\.[^.]+$/,''))}.${(file.name.split('.').pop()||'jpg')}`;
      const { error } = await sb.storage.from('media').upload(path, file, { upsert:false });
      if (error) throw error;
      return sb.storage.from('media').getPublicUrl(path).data.publicUrl;
    },

    /* ----- generator presets ----- */
    async savePreset(modelKey, name, params, isPublic){
      await ready;
      if (!sb || !currentUser) throw new Error('Sign in to save a preset to your account.');
      const { error } = await sb.from('saved_configs').insert({
        owner_id: currentUser.id, model_key: modelKey, name, params, is_public: !!isPublic });
      if (error) throw error;
    },
    async listPresets(modelKey){
      await ready;
      if (!sb) return [];
      const { data } = await sb.from('saved_configs').select('*')
        .eq('model_key', modelKey).order('created_at',{ ascending:false }).limit(40);
      return data || [];
    },

    /* ----- newsletter ----- */
    async subscribe(email, source){
      await ready;
      if (!sb) throw new Error('Email signup goes live once the backend is connected.');
      const { error } = await sb.from('subscribers').insert({ email, source: source || 'site' });
      if (error && error.code !== '23505') throw error;   // ignore duplicates
    },

    /* ----- categories present in the current content ----- */
    async categories(){
      const rows = await this.listArticles({ limit:200 });
      return ['All', ...[...new Set(rows.map(r => r.category))].sort()];
    }
  };

  // let the header know where auth stands even in offline mode
  ready.then(() => { if (!sb) window.dispatchEvent(new CustomEvent('hhq:auth',{ detail:{ user:null }})); });
})();
