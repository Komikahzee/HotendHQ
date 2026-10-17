// AI image-to-3D engines, run on Hugging Face ZeroGPU Spaces straight from the browser with the user's own
// HF token (the GPU time comes out of their account's daily quota). Both models are MIT licensed.
//
//   TRELLIS.2 (microsoft/TRELLIS.2)    4B-parameter sparse-voxel model, cascade up to 1536³
//   Pixal3D  (TencentARC/Pixal3D)      TRELLIS.2 backbone with pixel-aligned conditioning: stays closer to
//                                      the photo (faces, logos, small parts line up with the picture)
//
// The token is only ever kept in memory (and in localStorage if the user ticks "remember"), and is sent
// only to huggingface.co / *.hf.space.

import { Client, handle_file } from '/assets/vendor/gradio/gradio-client.js';

export const ENGINES = {
  trellis2: { id: 'trellis2', space: 'microsoft/TRELLIS.2', name: 'TRELLIS.2', blurb: 'Sharpest geometry' },
  pixal3d: { id: 'pixal3d', space: 'TencentARC/Pixal3D', name: 'Pixal3D', blurb: 'Most faithful to the photo' },
};

const clients = {};
async function client(engine, token) {
  const key = engine + ':' + (token ? token.slice(-6) : '');
  if (!clients[key]) {
    clients[key] = Client.connect(ENGINES[engine].space, token ? { token } : {}).catch((e) => { delete clients[key]; throw e; });
  }
  return clients[key];
}
export function resetClients() { for (const k of Object.keys(clients)) delete clients[k]; }

function friendly(err) {
  const m = String(err?.message || err?.title || err || '');
  if (/quota|exceeded your gpu|ZeroGPU/i.test(m)) return new Error('Out of free GPU time on this Hugging Face account for today. ' + (m.match(/Try again in [^.]+/i)?.[0] || 'It refills daily.'));
  if (/401|unauthori|invalid.*token/i.test(m)) return new Error('Hugging Face rejected the token. Paste a fresh read token from huggingface.co/settings/tokens.');
  if (/sleep|paused|building|starting/i.test(m)) return new Error('That Space is waking up. Try again in a minute.');
  return new Error(m || 'The Space returned an error.');
}

async function fetchFile(fd, token) {
  const url = fd?.url || fd?.path;
  if (!url) throw new Error('The Space did not return a file.');
  const r = await fetch(url, token ? { headers: { Authorization: `Bearer ${token}` } } : {});
  if (!r.ok) throw new Error(`Download failed (${r.status}).`);
  return r.blob();
}

// Space-side background removal and framing (each Space uses its own preprocessor, the one it was trained on).
export async function preprocess(engine, imageBlob, token) {
  try {
    const c = await client(engine, token);
    const ep = engine === 'pixal3d' ? '/preprocess' : '/preprocess_image';
    const r = await c.predict(ep, engine === 'pixal3d' ? { image: handle_file(imageBlob) } : { input: handle_file(imageBlob) });
    return fetchFile(r.data[0], token);
  } catch (e) { throw friendly(e); }
}

// One generation. Returns { glb: Blob, seed }.
export async function generate(engine, imageBlob, s, token, onStage) {
  const res = String(s.resolution || 1536);
  const common = {
    ss_guidance_strength: s.ssGuidance ?? 7.5, ss_guidance_rescale: 0.7, ss_sampling_steps: s.ssSteps ?? 12, ss_rescale_t: 5.0,
    shape_slat_guidance_strength: s.shapeGuidance ?? 7.5, shape_slat_guidance_rescale: 0.5, shape_slat_sampling_steps: s.shapeSteps ?? 12, shape_slat_rescale_t: 3.0,
    tex_slat_guidance_strength: 1.0, tex_slat_guidance_rescale: 0.0, tex_slat_sampling_steps: s.texSteps ?? 12, tex_slat_rescale_t: 3.0,
  };
  const decim = Math.round(s.faces ?? 500000), tex = Math.round(s.texture ?? 2048);
  try {
    const c = await client(engine, token);
    if (engine === 'trellis2') {
      try { await c.predict('/start_session', {}); } catch { /* older builds start the session on load */ }
      onStage?.('Generating on the GPU');
      await c.predict('/image_to_3d', { image: handle_file(imageBlob), seed: s.seed, resolution: res, ...common });
      onStage?.('Extracting the mesh');
      const r = await c.predict('/extract_glb', { decimation_target: decim, texture_size: tex });
      return { glb: await fetchFile(r.data[0], token), seed: s.seed };
    }
    const sid = 'hhq' + Math.random().toString(36).slice(2, 12);
    onStage?.('Generating on the GPU');
    const g = await c.predict('/generate_3d', { image: handle_file(imageBlob), seed: s.seed, resolution: Number(res), ...common, manual_fov: -1, fov_unit: 'deg', session_id: sid });
    const state = g.data[0]?.state_path || g.data[0];
    onStage?.('Extracting the mesh');
    const r = await c.predict('/extract_glb_api', { state_path: state, decimation_target: decim, texture_size: tex, session_id: sid });
    return { glb: await fetchFile(r.data[0], token), seed: s.seed };
  } catch (e) { throw friendly(e); }
}

// Is the Space up and answering? Returns its endpoint names.
export async function ping(engine, token) {
  try { const c = await client(engine, token); return Object.keys((await c.view_api()).named_endpoints); } catch (e) { throw friendly(e); }
}
