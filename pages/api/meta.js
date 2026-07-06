export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  try {
    const r = await fetch('https://api.mireye.com/v1/meta/fields');
    const data = await r.json();
    return res.status(200).json(data);
  } catch (e) {
    console.error('meta proxy error', e);
    return res.status(502).json({ error: 'meta_fetch_failed' });
  }
}
