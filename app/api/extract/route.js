// ═══════════════════════════════════════════════════════════════════════════
// /api/video/stream — Video URL extraction (v98 — REBUILT)
// ═══════════════════════════════════════════════════════════════════════════
//
// v98 FIX: The extraction sources were NOT being used because:
//   1. extractViaConfiguredSources read settings independently (async)
//   2. The settings cache might return DEFAULT_SETTINGS (no extractionSources)
//   3. The function was called without passing the settings object
//
// v98 SOLUTION: Pass settings directly to extractFreshUrl → no independent read
// ═══════════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';
import { getSiteSettings, applyDomainRedirects } from '@/lib/settings';
import { getSupabaseAdminSafe } from '@/lib/supabaseAdmin';
import { getReadClient } from '@/lib/dbClient';

const FRESH_CACHE_TTL_MS = 15 * 60 * 1000;
const MAX_CACHE_TTL_MS = 60 * 60 * 1000;

function isDirectVideoUrl(url) {
  if (!url) return false;
  return /\.(mp4|webm|ogg|mov|m3u8)(\?|$)/i.test(url.toLowerCase().split('?')[0]);
}

// v150: Check if URL is an embed page (ends with embed.html or contains /embed/)
function isEmbedPageUrl(url) {
  if (!url) return false;
  const lower = url.toLowerCase().split('?')[0];
  return lower.endsWith('embed.html') || lower.includes('/embed/') || lower.includes('/embedframe/');
}

async function isUrlValid(url) {
  if (!url) return false;
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(3000),
      redirect: 'follow',
    });
    if (res.status === 410 || res.status === 403 || res.status === 404) return false;
    return true;
  } catch { return true; }
}

// ─── Strategy 1: Server-side fetch + regex ──────────────────────────────────
async function extractViaServerFetch(embedUrl) {
  try {
    const res = await fetch(embedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const patterns = [
      /setVideoUrlHigh\s*\(\s*['"]([^'"]+)['"]\s*\)/i,
      /setVideoUrlLow\s*\(\s*['"]([^'"]+)['"]\s*\)/i,
      /setVideoHLS\s*\(\s*['"]([^'"]+)['"]\s*\)/i,
      /["'](?:videoUrl|streamUrl|playUrl|source|src|file)["']\s*:\s*["']([^"']+\.mp4[^"']*)["']/i,
      /["'](?:videoUrl|streamUrl|playUrl|source|src|file)["']\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i,
      /<source[^>]+src=["']([^"']+)["']/i,
      /<video[^>]+src=["']([^"']+)["']/i,
      /https:\/\/[^"'\s]+\.xvideos-cdn\.com[^"'\s]+\.mp4[^"'\s]*/i,
      /https:\/\/[^"'\s]+\.mp4[^"'\s]*/i,
      /html5player\.setVideoUrlHigh\(['"]([^'"]+)['"]\)/i,
      /html5player\.setVideoUrlLow\(['"]([^'"]+)['"]\)/i,
      /html5player\.setVideoHLS\(['"]([^'"]+)['"]\)/i,
    ];
    for (const p of patterns) {
      const m = html.match(p);
      if (m && m[1]) {
        const url = m[1].replace(/\\u002F/g, '/').replace(/\\\//g, '/').replace(/&amp;/g, '&');
        if (isDirectVideoUrl(url) || /^https?:\/\//i.test(url)) return url;
      }
    }
    return null;
  } catch { return null; }
}

// ─── Strategy 2: Configured external APIs ───────────────────────────────────
// v99: Reads sources DIRECTLY from site_settings table (not via getSiteSettings)
// This bypasses the cache + DEFAULT_SETTINGS merge issue
async function extractViaConfiguredSources(embedUrl, admin) {
  try {
    // Read directly from DB
    const { data: settingsRow } = await admin
      .from('site_settings')
      .select('settings')
      .eq('id', 'main')
      .maybeSingle();

    const sources = (settingsRow?.settings?.extractionSources || []).filter((s) => s.enabled);
    if (sources.length === 0) return null;

    for (const source of sources) {
      try {
        const apiUrl = source.url.replace('{URL}', encodeURIComponent(embedUrl));
        const res = await fetch(apiUrl, {
          signal: AbortSignal.timeout(source.timeoutMs || 8000),
          headers: { 'Accept': 'application/json' },
        });
        if (!res.ok) continue;

        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) continue;

        const data = await res.json();
        const url = data[source.extractField] || data.streamUrl || data.url || data.result || data.videoUrl;
        if (url && typeof url === 'string' && url.startsWith('http')) {
          return url;
        }
      } catch { continue; }
    }
  } catch {}
  return null;
}

async function cacheDirectUrl(videoId, url) {
  try {
    const admin = getSupabaseAdminSafe();
    if (!admin) return;
    await admin
      .from('media_items')
      .update({ direct_url: url, updated_at: new Date().toISOString() })
      .eq('id', videoId);
  } catch {}
}

// ─── Extract fresh URL (v99: reads sources directly from DB) ────────────────
async function extractFreshUrl(embedUrl) {
  // Strategy 1: Server-side fetch + regex
  let url = await extractViaServerFetch(embedUrl);
  if (url) return { url, method: 'server-fetch' };

  // Strategy 2: Configured external APIs (v99: reads directly from DB)
  const admin = getSupabaseAdminSafe();
  if (admin) {
    url = await extractViaConfiguredSources(embedUrl, admin);
    if (url) return { url, method: 'configured-source' };
  }

  return null;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const videoId = searchParams.get('videoId');
  const forceFresh = searchParams.get('force') === '1';

  if (!videoId) {
    return NextResponse.json({ error: 'Missing videoId' }, { status: 400 });
  }

  // v98: Read settings ASYNC — includes extractionSources
  const settings = await getSiteSettings();
  const redirects = settings?.domainRedirects || [];

  // 1. Fetch video from DB (v120: unified getReadClient with auto-failover)
  const { client: dbClient } = await getReadClient();
  const { data: video, error: dbError } = await (dbClient || supabase)
    .from('media_items')
    .select('id, embed_url, direct_url, updated_at, status')
    .eq('id', videoId)
    .single();

  if (dbError || !video) {
    return NextResponse.json({ error: 'Video not found' }, { status: 404 });
  }

  // 2. Check cache
  if (!forceFresh && video.direct_url && video.updated_at) {
    const ageMs = Date.now() - new Date(video.updated_at).getTime();
    if (ageMs < FRESH_CACHE_TTL_MS) {
      return NextResponse.json({ streamUrl: applyDomainRedirects(video.direct_url, redirects), source: 'cache-hit-fresh' });
    }
    if (ageMs < MAX_CACHE_TTL_MS) {
      const valid = await isUrlValid(video.direct_url);
      if (valid) {
        return NextResponse.json({ streamUrl: applyDomainRedirects(video.direct_url, redirects), source: 'cache-hit-validated' });
      }
    }
  }

  // 3. Direct embed (mp4/webm/m3u8)
  if (video.embed_url && isDirectVideoUrl(video.embed_url)) {
    const url = applyDomainRedirects(video.embed_url, redirects);
    await cacheDirectUrl(videoId, url);
    return NextResponse.json({ streamUrl: url, source: 'direct-embed' });
  }

  // 4. Extract fresh URL
  if (!video.embed_url) {
    return NextResponse.json({ streamUrl: null, source: 'extraction-failed', error: 'No embed_url' });
  }

  const result = await extractFreshUrl(video.embed_url);

  if (result) {
    const url = applyDomainRedirects(result.url, redirects);
    await cacheDirectUrl(videoId, url);
    return NextResponse.json({ streamUrl: url, source: result.method });
  }

  // v150: Strategy 3 — If embed_url is an embed page (embed.html), pass it directly
  if (isEmbedPageUrl(video.embed_url)) {
    const url = applyDomainRedirects(video.embed_url, redirects);
    return NextResponse.json({ streamUrl: url, source: 'embed-page', embedMode: true });
  }

  // v150: Strategy 4 — Last resort: pass the embed_url as-is for iframe playback
  if (video.embed_url) {
    const url = applyDomainRedirects(video.embed_url, redirects);
    return NextResponse.json({ streamUrl: url, source: 'embed-url-fallback', embedMode: true });
  }

  // 5. All strategies failed
  return NextResponse.json({
    streamUrl: null,
    embedUrl: video.embed_url,
    source: 'extraction-failed',
    error: 'All strategies failed — try using a VPN',
    sourcesCount: (settings?.extractionSources || []).filter((s) => s.enabled).length,
  });
      }
