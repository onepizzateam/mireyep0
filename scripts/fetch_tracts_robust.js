const fs = require('fs/promises');

async function fetchJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Fetch failed ${r.status} ${r.statusText}`);
  return r.json();
}

async function geocodeCity(city) {
  // Use US Census Geocoder API: https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=<city>&benchmark=Public_AR_Current&format=json
  const q = encodeURIComponent(city);
  const url = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${q}&benchmark=Public_AR_Current&format=json`;
  const j = await fetchJson(url);
  const coords = j.result && j.result.addressMatches && j.result.addressMatches[0] && j.result.addressMatches[0].coordinates;
  if (!coords) throw new Error('Geocoder did not return coordinates for ' + city);
  return { lat: coords.y, lng: coords.x };
}

async function fetchTractsByBBox(minx, miny, maxx, maxy) {
  // TIGERweb ArcGIS REST query using geometry envelope
  const geom = `${minx},${miny},${maxx},${maxy}`;
  const url = `https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Tracts/MapServer/0/query?where=1=1&geometry=${encodeURIComponent(geom)}&geometryType=esriGeometryEnvelope&inSR=4326&outFields=*&f=geojson`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`TIGERweb query failed ${r.status}`);
  return r.text();
}

async function main() {
  const city = process.argv[2] || 'Phoenix, AZ';
  const outDir = 'data/tracts';
  await fs.mkdir(outDir, { recursive: true });
  console.log('Geocoding:', city);
  try {
    const center = await geocodeCity(city);
    // Create a bbox around center of ~0.2 degrees (~22km) to cover city; refine by city if needed
    const delta = 0.2;
    const minx = center.lng - delta, miny = center.lat - delta, maxx = center.lng + delta, maxy = center.lat + delta;
    console.log('Querying TIGERweb bbox:', minx, miny, maxx, maxy);
    const geojson = await fetchTractsByBBox(minx, miny, maxx, maxy);
    const outPath = `${outDir}/${city.toLowerCase().replace(/[^a-z0-9]+/g,'-')}.geojson`;
    await fs.writeFile(outPath, geojson, 'utf8');
    console.log('Saved tracts to', outPath);
  } catch (e) {
    console.error('Failed to fetch tracts:', e.message || e);
    process.exit(1);
  }
}

main().catch(e=>{ console.error(e); process.exit(99); });
