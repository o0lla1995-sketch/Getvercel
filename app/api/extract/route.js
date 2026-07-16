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
  const url = searchParams.get('url');

  if (!url) return NextResponse.json({ error: "Missing url" }, { status: 400 });

  // اختيار بروكسي عشوائي
  const rawProxy = proxies[Math.floor(Math.random() * proxies.length)];
  const [ip, port, user, pass] = rawProxy.split(':');
  const proxyUrl = `http://${user}:${pass}@${ip}:${port}`;
  
  const agent = new HttpsProxyAgent(proxyUrl);

  try {
    const response = await axios.get(url, {
      httpsAgent: agent,
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
      },
      timeout: 10000 // تحديد وقت انتظار 10 ثوانٍ لضمان عدم تعليق السيرفر
    });

    const match = response.data.match(/setVideoUrlHigh\('(.*?)'\)/);

    if (match) {
      return NextResponse.json({ success: true, streamUrl: match[1] });
    } else {
      return NextResponse.json({ error: "Failed to extract (Pattern not found)" }, { status: 404 });
    }
  } catch (e) {
    return NextResponse.json({ 
      error: "Connection error", 
      details: e.message 
    }, { status: 500 });
  }
}
