import { NextResponse } from 'next/server';
import axios from 'axios';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get('url');

  if (!targetUrl) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  try {
    // طلب مباشر من استضافة Vercel إلى رابط الـ Embed
    const response = await axios.get(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Referer': 'https://www.xvideos.com/'
      },
      timeout: 8000 // مهلة 8 ثوانٍ لضمان عدم تعليق السيرفر
    });

    if (!response.data) {
      return NextResponse.json({ error: "Empty response from target" }, { status: 404 });
    }

    const htmlContent = response.data;

    // أنماط البحث الشاملة لاستخراج رابط الـ MP4 أو الـ CDN المباشر
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
        error: "Extraction failed: Pattern not found in HTML" 
      }, { status: 404 });
    }

  } catch (e) {
    return NextResponse.json({ 
      error: "Connection error", 
      details: e.message 
    }, { status: 500 });
  }
}
