const { execSync } = require('child_process');

const cities = ['Phoenix, AZ','Baltimore, MD'];
for (const c of cities) {
  console.log('Fetching', c);
  try {
    execSync(`node scripts/fetch_tracts_robust.js "${c}"`, { stdio: 'inherit' });
  } catch (e) {
    console.error('Fetch failed for', c);
  }
}
