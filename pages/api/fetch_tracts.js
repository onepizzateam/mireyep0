const fs = require('fs/promises');

async function fetchJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Fetch failed ${r.status} ${r.statusText}`);
  return r.json();
}

async function geocodeCity(city) {
  const q = encodeURIComponent(city);
  const url = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${q}&benchmark=Public_AR_Current&format=json`;
  const j = await fetchJson(url);
  const coords = j.result && j.result.addressMatches && j.result.addressMatches[0] && j.result.addressMatches[0].coordinates;
  if (!coords) throw new Error('Geocoder did not return coordinates for ' + city);
  return { lat: coords.y, lng: coords.x };
}

async function fetchTractsByBBox(minx, miny, maxx, maxy) {
  const geom = `${minx},${miny},${maxx},${maxy}`;
  const url = `https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Tracts/MapServer/0/query?where=1=1&geometry=${encodeURIComponent(geom)}&geometryType=esriGeometryEnvelope&inSR=4326&outFields=*&f=geojson`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`TIGERweb query failed ${r.status}`);
  return r.text();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { city } = req.body || {};
  if (!city) return res.status(400).json({ error: 'city required' });
  try {
    const center = await geocodeCity(city);
    const delta = 0.2;
    const minx = center.lng - delta, miny = center.lat - delta, maxx = center.lng + delta, maxy = center.lat + delta;
    const geojson = await fetchTractsByBBox(minx, miny, maxx, maxy);
    const outDir = 'data/tracts';
    await fs.mkdir(outDir, { recursive: true });
    const outPath = `${outDir}/${city.toLowerCase().replace(/[^a-z0-9]+/g,'-')}.geojson`;
    await fs.writeFile(outPath, geojson, 'utf8');
    return res.status(200).json({ saved: outPath });
  } catch (e) {
    console.error('fetch_tracts api error', e);
    return res.status(500).json({ error: String(e.message || e) });
  }
}
