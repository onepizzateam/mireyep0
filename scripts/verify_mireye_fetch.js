const fs = require('fs/promises');

function parseEnvFile(path, text) {
  const obj = {};
  const lines = text.split(/\r?\n/);
  for (const l of lines) {
    const line = l.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    const k = line.slice(0, idx).trim();
    const v = line.slice(idx + 1).trim();
    obj[k] = v.replace(/^\"|\"$/g, '');
  }
  return obj;
}

async function readEnvLocal() {
  try {
    const text = await fs.readFile('.env.local', 'utf8');
    // Debug: confirm presence
    console.log('.env.local raw length=', text.length, ", contains MIREYE_API_TOKEN=", text.indexOf('MIREYE_API_TOKEN=') !== -1);
    // Robustly extract MIREYE_API_TOKEN if present
    const m = text.match(/MIREYE_API_TOKEN\s*=\s*(.+)/);
    if (m && m[1]) return { MIREYE_API_TOKEN: m[1].trim() };
    return parseEnvFile('.env.local', text);
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

async function main() {
  console.log('verify_mireye_fetch.js cwd=', process.cwd());
  console.log('.env.local exists=', await (async () => { try { await fs.access('.env.local'); return true } catch(e) { return false } })());
  const env = await readEnvLocal();
  const token = process.env.MIREYE_API_TOKEN || env.MIREYE_API_TOKEN;
  if (!token) {
    console.error('MIREYE_API_TOKEN not found in environment or .env.local. Please add it and retry.');
    process.exit(3);
  }
  const fetchFn = await ensureFetch();

  const lat = 33.4484;
  const lng = -112.0740;

  console.log('Calling Mireye /v1/fetch for non-climate fields...');
  let nonClimateResp = null;
  try {
    nonClimateResp = await callMireyeFetch(fetchFn, token, lat, lng, HEAT_RISK_FIELDS);
  } catch (e) {
    console.error('Non-climate fetch failed:', e);
    process.exit(4);
  }

  console.log('Calling Mireye /v1/fetch for climate field days_above_32c_annual_count...');
  let climateResp = null;
  try {
    climateResp = await callMireyeFetch(fetchFn, token, lat, lng, ['days_above_32c_annual_count']);
  } catch (e) {
    console.error('Climate fetch failed:', e);
    process.exit(5);
  }

  await fs.mkdir('outputs', { recursive: true });
  const outObj = { lat, lng, fetched_at: new Date().toISOString(), non_climate: nonClimateResp, climate: climateResp };
  await fs.writeFile('outputs/verify_fetch_phoenix.json', JSON.stringify(outObj, null, 2), 'utf8');
  console.log('Wrote outputs/verify_fetch_phoenix.json');

  // Prepare a human-readable summary
  const lines = [];
  lines.push('# Phase 0 Verification — Phoenix, AZ');
  lines.push(`Date: ${new Date().toISOString()}`);
  lines.push('');
  lines.push('## Non-climate fields');
  for (const f of HEAT_RISK_FIELDS) {
    const detail = nonClimateResp.fields && nonClimateResp.fields[f];
    if (detail) {
      lines.push(`- **${f}**: value=${JSON.stringify(detail.value)}; confidence=${detail.confidence}; source=${detail.source}`);
    } else {
      lines.push(`- **${f}**: MISSING in response`);
    }
  }
  lines.push('');
  lines.push('## Climate field');
  const climateDetail = climateResp.fields && climateResp.fields['days_above_32c_annual_count'];
  if (climateDetail) {
    lines.push(`- **days_above_32c_annual_count**: value=${JSON.stringify(climateDetail.value)}; confidence=${climateDetail.confidence}; source=${climateDetail.source}`);
  } else {
    lines.push('- **days_above_32c_annual_count**: MISSING or null in response');
  }

  await fs.writeFile('outputs/phase0_summary.md', lines.join('\n'), 'utf8');
  console.log('Wrote outputs/phase0_summary.md');
  console.log('Phase 0 verification complete. Review outputs/verify_fetch_phoenix.json and outputs/phase0_summary.md');
}

main().catch(err => {
  console.error(err);
  process.exit(99);
});
