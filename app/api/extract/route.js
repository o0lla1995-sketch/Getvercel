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
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.xvideos.com/'
      }
    });

    const text = await response.text();
    const match = text.match(/setVideoUrlHigh\('(.*?)'\)/);

    if (match) {
      return NextResponse.json({ streamUrl: match[1] });
    } else {
      return NextResponse.json({ error: "Failed to extract" }, { status: 404 });
    }
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
