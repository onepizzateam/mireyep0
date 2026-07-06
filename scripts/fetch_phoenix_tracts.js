const fs = require('fs/promises');

async function main() {
  const outDir = 'data/tracts';
  await fs.mkdir(outDir, { recursive: true });

  // Maricopa County, AZ (STATE='04', COUNTY='013') covers Phoenix metro area
  const url = "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Tracts/MapServer/0/query?where=STATE='04'%20AND%20COUNTY='013'&outFields=*&f=geojson";
  console.log('Fetching Phoenix (Maricopa) tracts from TIGERweb...');
  const res = await fetch(url);
  if (!res.ok) {
    console.error('Failed to fetch tracts:', res.status, res.statusText);
    process.exit(2);
  }
  const geojson = await res.text();
  const outPath = `${outDir}/phoenix-az.geojson`;
  await fs.writeFile(outPath, geojson, 'utf8');
  console.log('Saved tracts to', outPath);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
