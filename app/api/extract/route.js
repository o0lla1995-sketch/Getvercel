import { NextResponse } from 'next/server';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');

  if (!url) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Referer': 'https://www.xvideos.com/'
      },
      // إعدادات إضافية لضمان عدم حظر الطلب
      redirect: 'follow'
    });

    const text = await response.text();
    
    // تجربة البحث عن صيغ مختلفة للرابط (توسيع نطاق البحث)
    const patterns = [
      /setVideoUrlHigh\('(.*?)'\)/,
      /html5player\.setVideoUrlHigh\('(.*?)'\)/,
      /html5player\.setVideoHLS\('(.*?)'\)/
    ];

    let streamUrl = null;
    for (let pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        streamUrl = match[1];
        break;
      }
    }

    if (streamUrl) {
      return NextResponse.json({ success: true, streamUrl });
    } else {
      // للتحقق من سبب الفشل، يمكننا طباعة جزء بسيط من النص (للتصحيح فقط)
      return NextResponse.json({ 
        error: "Failed to extract", 
        debug: text.substring(0, 100) // يعطيك أول 100 حرف لتعرف إذا كان الموقع حجبك
      }, { status: 404 });
    }
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
