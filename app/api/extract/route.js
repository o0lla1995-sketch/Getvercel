import { NextResponse } from 'next/server';
import axios from 'axios';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get('url');

  if (!targetUrl) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  try {
    // استخدام وكيل جلب عام ونظيف يمرر الطلب بـ IP مختلف تماماً لتجاوز الحظر المباشر
    const proxyApiUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`;
    
    const response = await axios.get(proxyApiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
      },
      timeout: 10000
    });

    if (!response.data || !response.data.contents) {
      return NextResponse.json({ error: "Empty response from proxy" }, { status: 404 });
    }

    const htmlContent = response.data.contents;

    // أنماط البحث الشاملة لاستخراج رابط الفيديو المباشر بدقة
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
        error: "Extraction failed: Pattern not found in HTML contents" 
      }, { status: 404 });
    }

  } catch (e) {
    return NextResponse.json({ 
      error: "Connection error", 
      details: e.message 
    }, { status: 500 });
  }
}
