import fetch from 'node-fetch';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { lat, lng, question } = req.body || {};
  if (!lat || !lng || !question) return res.status(400).json({ error: 'lat,lng,question required' });
  const token = process.env.MIREYE_API_TOKEN;
  if (!token) return res.status(500).json({ error: 'MIREYE_API_TOKEN not set on server' });

  try {
    const r = await fetch('https://api.mireye.com/v1/ask', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ lat, lng, question, include_trace: false })
    });
    const data = await r.json();
    return res.status(r.status).json(data);
  } catch (e) {
    console.error('ask proxy error', e);
    return res.status(502).json({ error: 'ask_failed', detail: e.message });
  }
}
