import { NextResponse } from 'next/server';
import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';

const proxies = [
  "31.59.20.176:6754:Aa45022270:Aa45022270",
  "31.56.127.193:7684:Aa45022270:Aa45022270",
  "45.38.107.97:6014:Aa45022270:Aa45022270",
  "198.105.121.200:6462:Aa45022270:Aa45022270",
  "64.137.96.74:6641:Aa45022270:Aa45022270",
  "198.23.243.226:6361:Aa45022270:Aa45022270",
  "38.154.185.97:6370:Aa45022270:Aa45022270",
  "84.247.60.125:6095:Aa45022270:Aa45022270",
  "142.111.67.146:5611:Aa45022270:Aa45022270",
  "191.96.254.138:6185:Aa45022270:Aa45022270"
];

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get('url');

  if (!targetUrl) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  // خلط قائمة البروكسيات عشوائياً في كل طلب لضمان عدم ثبات المسار
  const shuffledProxies = [...proxies].sort(() => 0.5 - Math.random());

  let htmlContent = null;
  let lastError = null;

  // تجربة ما يصل إلى 5 بروكسيات تلقائياً حتى ينجح أحدهم
  for (let i = 0; i < Math.min(5, shuffledProxies.length); i++) {
    const rawProxy = shuffledProxies[i];
    const [ip, port, user, pass] = rawProxy.split(':');
    const proxyUrl = `http://${user}:${pass}@${ip}:${port}`;
    const agent = new HttpsProxyAgent(proxyUrl);

    try {
      const response = await axios.get(targetUrl, {
        httpsAgent: agent,
        headers: { 
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Referer': 'https://www.xvideos.com/'
        },
        timeout: 7000 // مهلة 7 ثوانٍ لكل محاولة لسرعة الاستجابة
      });

      if (response.status === 200 && response.data) {
        htmlContent = response.data;
        break; // نجح جلب الصفحة، الخروج من الحلقة
      }
    } catch (e) {
      lastError = e.message;
      continue; // الانتقال لتجربة بروكسي آخر فوراً
    }
  }

  if (!htmlContent) {
    return NextResponse.json({ 
      error: "Connection error across all proxies", 
      details: lastError 
    }, { status: 500 });
  }

  // أنماط متعددة لاستخراج رابط الفيديو بدقة مطلقة
  const patterns = [
    /setVideoUrlHigh\('(.*?)'\)/,
    /setVideoUrlLow\('(.*?)'\)/,
    /https:\/\/[^"'\s]+\.xvideos-cdn\.com[^"'\s]+\.mp4[^"'\s]*/,
    /videoUrl\s*=\s*['"](.*?)['"]/
  ];

  let streamUrl = null;
  for (const pattern of patterns) {
    const match = htmlContent.match(pattern);
    if (match) {
      streamUrl = match[1] || match[0];
      break;
    }
  }

  if (streamUrl) {
    return NextResponse.json({ 
      success: true, 
      streamUrl: streamUrl.replace(/\\/g, '') 
    });
  } else {
    return NextResponse.json({ 
      error: "Failed to extract (Pattern not found)" 
    }, { status: 404 });
  }
}
