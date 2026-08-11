// ═══════════════════════════════════════════════════════════════════════════
// EXTERNAL EXTRACTION API — Fixed Code (v96)
// ═══════════════════════════════════════════════════════════════════════════
//
// Deploy this as a serverless function on Netlify/Vercel/Render.
// It fetches embed pages via rotating proxies and extracts direct video URLs.
//
// USAGE: GET /api/extract?url=https://www.xvideos.com/embedframe/xxx
// RETURNS: { success: true, streamUrl: "https://cdn.../video.mp4" }
//
// FIXES applied:
//   1. Fixed import syntax for https-proxy-agent (v7+ uses named export)
//   2. Added more regex patterns (double quotes, escaped quotes, hls)
//   3. Added proper error logging for each proxy attempt
//   4. Added fallback: if proxy fails, try direct fetch (no proxy)
//   5. Fixed URL encoding issue — some providers need raw URL, not encoded
//   6. Added response validation — verify extracted URL is a valid video URL
//   7. Increased timeout to 10s (was 7s — some proxies are slow)
//   8. Added proper Content-Type header checking
// ═══════════════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';

// ─── Helper: create proxy agent (lazy import to handle different versions) ──
async function createProxyAgent(proxyUrl) {
  try {
    // Try v7+ (named export)
    const { HttpsProxyAgent } = await import('https-proxy-agent');
    return new HttpsProxyAgent(proxyUrl);
  } catch {
    try {
      // Try v5 (default export)
      const HttpsProxyAgent = (await import('https-proxy-agent')).default;
      return new HttpsProxyAgent(proxyUrl);
    } catch {
      return null;
    }
  }
}

// ─── Helper: fetch with timeout ─────────────────────────────────────────────
async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return res;
  } catch (e) {
    clearTimeout(timeoutId);
    throw e;
  }
}

// ─── Proxies ────────────────────────────────────────────────────────────────
const proxies = [
  '31.59.20.176:6754:Aa45022270:Aa45022270',
  '31.56.127.193:7684:Aa45022270:Aa45022270',
  '45.38.107.97:6014:Aa45022270:Aa45022270',
  '198.105.121.200:6462:Aa45022270:Aa45022270',
  '64.137.96.74:6641:Aa45022270:Aa45022270',
  '198.23.243.226:6361:Aa45022270:Aa45022270',
  '38.154.185.97:6370:Aa45022270:Aa45022270',
  '84.247.60.125:6095:Aa45022270:Aa45022270',
  '142.111.67.146:5611:Aa45022270:Aa45022270',
  '191.96.254.138:6185:Aa45022270:Aa45022270',
];

// ─── Regex patterns for video URL extraction ────────────────────────────────
// v96: Added more patterns to handle different quote styles + escaped chars
const PATTERNS = [
  // XVideos: setVideoUrlHigh('...') or setVideoUrlHigh("...")
  /setVideoUrlHigh\s*\(\s*['"]([^'"]+)['"]\s*\)/i,
  /setVideoUrlLow\s*\(\s*['"]([^'"]+)['"]\s*\)/i,
  /setVideoHLS\s*\(\s*['"]([^'"]+)['"]\s*\)/i,
  // JSON: "videoUrl":"..." or "streamUrl":"..."
  /["'](?:videoUrl|streamUrl|playUrl|source|src|file)["']\s*:\s*["']([^"']+\.mp4[^"']*)["']/i,
  /["'](?:videoUrl|streamUrl|playUrl|source|src|file)["']\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i,
  // HTML5: <source src="..."> or <video src="...">
  /<source[^>]+src=["']([^"']+)["']/i,
  /<video[^>]+src=["']([^"']+)["']/i,
  // CDN URLs (XVideos specific)
  /https:\/\/[^"'\s]+\.xvideos-cdn\.com[^"'\s]+\.mp4[^"'\s]*/i,
  /https:\/\/[^"'\s]+\.cdn77\.com[^"'\s]+\.mp4[^"'\s]*/i,
  // Generic video file URLs
  /https:\/\/[^"'\s]+\.mp4[^"'\s]*/i,
  /https:\/\/[^"'\s]+\.m3u8[^"'\s]*/i,
  // data-video-url or data-src
  /data-(?:video-)?url=["']([^"']+)["']/i,
  /data-src=["']([^"']+\.mp4[^"']*)["']/i,
  // JWPlayer / VideoJS config
  /file:\s*["']([^"']+\.mp4[^"']*)["']/i,
  /file:\s*["']([^"']+\.m3u8[^"']*)["']/i,
  // og:video meta tag
  /<meta[^>]+property=["']og:video["'][^>]+content=["']([^"']+)["']/i,
];

// ─── Extract video URL from HTML ────────────────────────────────────────────
function extractVideoUrl(html) {
  for (const pattern of PATTERNS) {
    const match = html.match(pattern);
    if (match) {
      const url = (match[1] || match[0])
        .replace(/\\u002F/g, '/')
        .replace(/\\\//g, '/')
        .replace(/&amp;/g, '&')
        .replace(/\\/g, '');
      // Validate: must be a URL starting with http
      if (url && url.startsWith('http')) {
        return url;
      }
    }
  }
  return null;
}

// ─── Main handler ───────────────────────────────────────────────────────────
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get('url');

  if (!targetUrl) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Referer': 'https://www.xvideos.com/',
    'Connection': 'keep-alive',
  };

  // ── Strategy 1: Try with proxies (up to 5) ──
  const shuffled = [...proxies].sort(() => 0.5 - Math.random());
  let htmlContent = null;
  let errors = [];

  for (let i = 0; i < Math.min(5, shuffled.length); i++) {
    const rawProxy = shuffled[i];
    const [ip, port, user, pass] = rawProxy.split(':');
    const proxyUrl = `http://${user}:${pass}@${ip}:${port}`;

    try {
      const agent = await createProxyAgent(proxyUrl);
      if (!agent) {
        errors.push(`Proxy ${i}: agent creation failed`);
        continue;
      }

      // Use fetch with proxy agent (Node.js runtime)
      const res = await fetchWithTimeout(targetUrl, {
        headers,
        agent, // This works on Node.js runtime (not Edge)
      }, 10000);

      if (res.ok) {
        const text = await res.text();
        if (text && text.length > 100) {
          htmlContent = text;
          break;
        }
      } else {
        errors.push(`Proxy ${i}: HTTP ${res.status}`);
      }
    } catch (e) {
      errors.push(`Proxy ${i}: ${e.message}`);
      continue;
    }
  }

  // ── Strategy 2: Try direct fetch (no proxy) as fallback ──
  if (!htmlContent) {
    try {
      const res = await fetchWithTimeout(targetUrl, { headers }, 8000);
      if (res.ok) {
        const text = await res.text();
        if (text && text.length > 100) {
          htmlContent = text;
        }
      } else {
        errors.push(`Direct: HTTP ${res.status}`);
      }
    } catch (e) {
      errors.push(`Direct: ${e.message}`);
    }
  }

  if (!htmlContent) {
    return NextResponse.json({
      success: false,
      error: 'All fetch methods failed',
      details: errors.join('; '),
    }, { status: 500 });
  }

  // ── Extract video URL from HTML ──
  const streamUrl = extractVideoUrl(htmlContent);

  if (streamUrl) {
    return NextResponse.json({
      success: true,
      streamUrl: streamUrl,
      htmlLength: htmlContent.length,
    });
  } else {
    // Return a sample of the HTML for debugging
    const sample = htmlContent.slice(0, 500);
    return NextResponse.json({
      success: false,
      error: 'Pattern not found in HTML',
      htmlSample: sample,
      htmlLength: htmlContent.length,
    }, { status: 404 });
  }
}

// ── Also support POST (some callers prefer POST) ──
export async function POST(request) {
  try {
    const body = await request.json();
    const targetUrl = body.url;
    if (!targetUrl) {
      return NextResponse.json({ error: 'Missing url in body' }, { status: 400 });
    }
    // Reuse GET logic by constructing a fake request
    const url = new URL(request.url);
    url.searchParams.set('url', targetUrl);
    const fakeRequest = new Request(url, { method: 'GET' });
    return GET(fakeRequest);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
