/* ============================================================
   HOTEND HQ — Single source of truth for site configuration.
   Edit this file and nothing else to rebrand, re-tag, or connect
   the backend. Every page reads from here.
   ============================================================ */
window.HHQ_CONFIG = {
  siteName: 'Hotend HQ',
  tagline: 'Everything 3D Printing',
  domain: 'hotendhq.com',
  baseUrl: 'https://hotendhq.com',

  /* --- Affiliate tracking ---------------------------------
     Put your Amazon Associates tag here ONCE. Every product
     link on the site is built from it at runtime.            */
  affiliate: {
    amazonTag: '',
    disclosure: 'Hotend HQ is reader-supported. When you buy through links on this site we may earn an affiliate commission at no extra cost to you. We only recommend hardware we would run on our own machines.'
  },

  /* --- Backend (Supabase) ---------------------------------
     Create a free project at supabase.com, run supabase/schema.sql
     in the SQL editor, then paste your Project URL and the
     anon/public key below. The anon key is safe in the browser:
     Row Level Security in schema.sql is what protects the data.
     Leave these blank and the site runs in demo mode on the
     bundled seed content.                                     */
  supabase: {
    url: 'https://izkqzodgvkzvjekafyhn.supabase.co',
    anonKey: 'sb_publishable_DU5YH5j1cx3V6MziTknhOQ_j4_a3aUq'
  },

  social: {
    tiktok: 'https://www.tiktok.com/@hotendhq',
    youtube: '',
    email: 'cobornassets@gmail.com'
  }
};
