const fs = require('fs/promises');

const HEAT_RISK_FIELDS = [
  'tree_canopy_pct',
  'land_use_class',
  'lcms_class',
  'ndvi_change_5y',
  'slope_degrees',
  'surface_water_permanence_pct',
  'coast_distance_m',
  'soil_drainage_class'
];

async function readEnvLocal() {
  try {
    const text = await fs.readFile('.env.local', 'utf8');
    const m = text.match(/MIREYE_API_TOKEN\s*=\s*(.+)/);
    if (m && m[1]) return { MIREYE_API_TOKEN: m[1].trim() };
    return {};
  } catch (e) {
    return {};
  }
}

async function ensureFetch() {
  if (typeof fetch === 'function') return fetch;
  try {
    const nodeFetch = await import('node-fetch');
    return nodeFetch.default;
  } catch (e) {
    throw new Error('No fetch available; please run on Node 18+ or install node-fetch');
  }
}

function centroidFromGeoJSONFeature(feat) {
  // Approximate centroid using bbox center of all coordinates in geometry
  const coords = [];
  const geom = feat.geometry;
  function collect(arr) {
    for (const el of arr) {
      if (typeof el[0] === 'number') {
        coords.push(el);
      } else {
        collect(el);
      }
    }
  }
  if (geom.type === 'Polygon' || geom.type === 'MultiPolygon') {
    collect(geom.coordinates);
  }
  if (coords.length === 0) return null;
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (const c of coords) {
    const x = c[0], y = c[1];
    if (x < minx) minx = x; if (x > maxx) maxx = x;
    if (y < miny) miny = y; if (y > maxy) maxy = y;
  }
  return { lng: (minx + maxx) / 2, lat: (miny + maxy) / 2 };
}

async function callMireyeFetch(fetchFn, token, lat, lng, fields) {
  const url = 'https://api.mireye.com/v1/fetch';
  const res = await fetchFn(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ lat, lng, fields })
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Mireye fetch failed: ${res.status} ${res.statusText} - ${txt}`);
  }
  return res.json();
}

function computeScoreForTracts(rows) {
  // rows: [{id, props, values, climate_value}]
  // Build arrays for normalization
  const arr = {
    tree_canopy_pct: [],
    built_fraction: [],
    days_above_32c_annual_count: [],
    ndvi_change_5y: [],
    slope_degrees: [],
    surface_water_permanence_pct: [],
    coast_distance_m: []
  };
  for (const r of rows) {
    const f = r.values;
    const land = f.land_use_class && f.land_use_class.value;
    const built = land === 'Developed' ? 1 : 0; // centroid-only proxy
    arr.tree_canopy_pct.push(f.tree_canopy_pct ? f.tree_canopy_pct.value : 0);
    arr.built_fraction.push(built);
    arr.days_above_32c_annual_count.push(r.climate_value != null ? r.climate_value : 0);
    arr.ndvi_change_5y.push(f.ndvi_change_5y ? f.ndvi_change_5y.value : 0);
    arr.slope_degrees.push(f.slope_degrees ? f.slope_degrees.value : 0);
    arr.surface_water_permanence_pct.push(f.surface_water_permanence_pct ? f.surface_water_permanence_pct.value : 0);
    arr.coast_distance_m.push(f.coast_distance_m ? f.coast_distance_m.value : 0);
  }

  function minmax(a) { return { min: Math.min(...a), max: Math.max(...a) }; }
  const mm = {};
  for (const k of Object.keys(arr)) mm[k] = minmax(arr[k]);

  // weights per AGENTS.md
  const weights = {
    tree_canopy_pct: 0.35,
    built_fraction: 0.25,
    days_above_32c_annual_count: 0.15,
    ndvi_change_5y: 0.10,
    slope_degrees: 0.08,
    water_proximity: 0.07
  };

  function normalize(value, min, max) {
    if (max === min) return 0.5;
    return (value - min) / (max - min);
  }

  for (const r of rows) {
    const f = r.values;
    const built = (f.land_use_class && f.land_use_class.value === 'Developed') ? 1 : 0;
    const tc = f.tree_canopy_pct ? f.tree_canopy_pct.value : 0;
    const days = r.climate_value != null ? r.climate_value : 0;
    const ndvi = f.ndvi_change_5y ? f.ndvi_change_5y.value : 0;
    const slope = f.slope_degrees ? f.slope_degrees.value : 0;
    const sw = f.surface_water_permanence_pct ? f.surface_water_permanence_pct.value : 0;
    const coast = f.coast_distance_m ? f.coast_distance_m.value : 0;

    // normalized components
    const tc_n = 1 - normalize(tc, mm.tree_canopy_pct.min, mm.tree_canopy_pct.max); // higher canopy -> lower risk
    const built_n = normalize(built, mm.built_fraction.min, mm.built_fraction.max);
    const days_n = normalize(days, mm.days_above_32c_annual_count.min, mm.days_above_32c_annual_count.max);
    const ndvi_n = normalize(-ndvi, -mm.ndvi_change_5y.max, -mm.ndvi_change_5y.min); // more negative -> higher risk
    const slope_n = 1 - normalize(slope, mm.slope_degrees.min, mm.slope_degrees.max); // flatter -> higher risk
    const sw_n = 1 - normalize(sw, mm.surface_water_permanence_pct.min, mm.surface_water_permanence_pct.max); // less water -> higher risk
    const coast_n = 1 - normalize(coast, mm.coast_distance_m.min, mm.coast_distance_m.max); // closer -> lower distance -> lower risk, so invert

    const water_n = (sw_n + coast_n) / 2;

    const score = (
      weights.tree_canopy_pct * tc_n +
      weights.built_fraction * built_n +
      weights.days_above_32c_annual_count * days_n +
      weights.ndvi_change_5y * ndvi_n +
      weights.slope_degrees * slope_n +
      weights.water_proximity * water_n
    );

    r.score = Math.max(0, Math.min(1, score));
  }

  // Normalize final scores to 0..1 by min-max
  const scores = rows.map(r => r.score);
  const minS = Math.min(...scores), maxS = Math.max(...scores);
  for (const r of rows) {
    if (maxS === minS) r.score = 0.5; else r.score = (r.score - minS) / (maxS - minS);
    if (r.score >= 0.7) r.tier = 'High'; else if (r.score >= 0.4) r.tier = 'Moderate'; else r.tier = 'Lower';
  }
}

async function main() {
  const env = await readEnvLocal();
  const token = process.env.MIREYE_API_TOKEN || env.MIREYE_API_TOKEN;
  if (!token) { console.error('MIREYE_API_TOKEN not found.'); process.exit(2); }
  const fetchFn = await ensureFetch();

  let geo = null;
  try {
    geo = JSON.parse(await fs.readFile('data/tracts/phoenix-az.geojson', 'utf8'));
  } catch (e) {
    console.warn('Tracts file missing or unreadable, falling back to grid sampling');
  }

  let rows = [];
  if (geo && geo.features && geo.features.length) {
    const features = geo.features;
    // Prepare rows for tracts
    rows = features.map((feat, idx) => ({ id: idx, feat }));
  } else {
    // Fallback: generate a grid around Phoenix center
    const center = { lat: 33.4484, lng: -112.0740 };
    const halfDeg = 0.12; // ~13km
    const nx = parseInt(process.env.SCORE_GRID_NX || '8', 10) || 8;
    const ny = parseInt(process.env.SCORE_GRID_NY || '8', 10) || 8;
    let id = 0;
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        const lng = center.lng - halfDeg + (i / (nx - 1)) * (2 * halfDeg);
        const lat = center.lat - halfDeg + (j / (ny - 1)) * (2 * halfDeg);
        rows.push({ id: id++, centroid: { lat, lng }, isGrid: true });
      }
    }
    // create a minimal geo object for compatibility later
    geo = { type: 'FeatureCollection', features: [] };
  }

  // Compute centroids for tract features; grid rows already have centroids
  for (const r of rows) {
    if (r.centroid) continue;
    if (r.feat) {
      const c = centroidFromGeoJSONFeature(r.feat);
      r.centroid = c;
    } else {
      r.centroid = null;
    }
  }

  // Concurrency (configurable)
  const concurrency = parseInt(process.env.SCORE_CONCURRENCY || '4', 10) || 4;
  const queue = rows.slice();
  const results = [];

  async function worker() {
    while (queue.length) {
      const r = queue.shift();
      if (!r.centroid) { r.values = {}; r.climate_value = null; continue; }
      try {
        const non = await callMireyeFetch(fetchFn, token, r.centroid.lat, r.centroid.lng, HEAT_RISK_FIELDS);
        const cli = await callMireyeFetch(fetchFn, token, r.centroid.lat, r.centroid.lng, ['days_above_32c_annual_count']);
        r.values = non.fields || {};
        r.climate_value = (cli.fields && cli.fields.days_above_32c_annual_count) ? cli.fields.days_above_32c_annual_count.value : null;
      } catch (e) {
        console.error('fetch error for tract', r.id, e.message || e);
        r.values = {};
        r.climate_value = null;
      }
      results.push(r);
    }
  }

  const workers = [];
  for (let i = 0; i < concurrency; i++) workers.push(worker());
  await Promise.all(workers);

  // Compute scores
  computeScoreForTracts(results);

  // Attach scores to GeoJSON. If we fell back to grid sampling, create Point features.
  const outGeo = JSON.parse(JSON.stringify(geo || { type: 'FeatureCollection', features: [] }));
  if (!outGeo.features || outGeo.features.length === 0) {
    outGeo.features = results.map(r => ({
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Point',
        coordinates: r.centroid ? [r.centroid.lng, r.centroid.lat] : [null, null]
      }
    }));
  }

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const feat = outGeo.features[i];
    feat.properties = feat.properties || {};
    feat.properties.heat_score = r.score;
    feat.properties.heat_tier = r.tier;
    feat.properties._mireye = {
      fields: Object.keys(r.values || {}).reduce((acc,k)=>{ acc[k]=r.values[k].value; return acc }, {}),
      climate: r.climate_value
    };
  }

  await fs.mkdir('outputs', { recursive: true });
  await fs.writeFile('outputs/tracts_with_scores.geojson', JSON.stringify(outGeo, null, 2), 'utf8');
  const top = results.sort((a,b)=>b.score-a.score).slice(0,10).map(r=>({ id: r.id, score:r.score, tier:r.tier, climate:r.climate_value, fields: Object.keys(r.values||{}).reduce((acc,k)=>{ acc[k]=r.values[k].value; return acc }, {}) }));
  await fs.writeFile('outputs/top10.json', JSON.stringify(top, null, 2), 'utf8');
  console.log('Wrote outputs/tracts_with_scores.geojson and outputs/top10.json');
}

main().catch(err=>{ console.error(err); process.exit(99) });
