# SignalRent

Cell tower lease valuation. One address, 60 federal data points, a data-backed estimate and a read on your negotiating leverage.

## What is SignalRent?

SignalRent tells US property owners what their cell tower lease is actually worth. Enter an address, get a data-backed valuation estimate tied to federal tower siting data, benchmark market ranges, and plain-English negotiating guidance.

**The free valuation includes:**
- Site Score (0–100) with dimension breakdown
- Market benchmark range (monthly and annual)
- Negotiating position analysis
- Optional rate comparison and buyout analysis

## Quick Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FYOURNAME%2Fsignalrent&env=MIREYE_API_KEY&project-name=signalrent&repository-name=signalrent)

## Environment Setup

### Required: Mireye API Key & Mapbox Token

1. **Mireye API key**: Sign up at [mireye.com](https://mireye.com), get key from project settings
2. **Mapbox token**: Get a public token from [mapbox.com](https://mapbox.com)
3. Set both in Vercel: Project Settings → Environment Variables:
   - `MIREYE_API_KEY` (server-side only)
   - `NEXT_PUBLIC_MAPBOX_TOKEN` (public, used in browser)

### Local Development

```bash
# Clone the repo
git clone https://github.com/YOURNAME/signalrent.git
cd signalrent

# Install dependencies
npm install

# Set environment variables
cp .env.example .env.local
# Edit .env.local and add:
#   MIREYE_API_KEY=your_mireye_key
#   NEXT_PUBLIC_MAPBOX_TOKEN=your_mapbox_token

# Run dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Data Sources

Benchmark ranges are calibrated to published industry data (Steel in the Air, Vertical Consultants, Tower Genius) and documented negotiated outcomes. Site valuations are derived from:

- **FCC Antenna Structure Registry** — tower locations and attributes
- **USDA SSURGO** — soil and bedrock depth
- **FEMA National Flood Hazard Layer** — floodplain exposure
- **USFWS National Wetlands Inventory** — wetland status
- **US Census** — housing density and population
- **NOAA & USGS** — seismic and lightning risk

Not a substitute for professional appraisal.

## Scripts

```bash
npm run dev        # Start development server
npm run build      # Build for production
npm start          # Start production server
npm run lint       # Run ESLint
npm test           # Run Jest tests
npm run test:watch # Watch mode for tests
```

## Technology

- **Next.js 16** — App Router, TypeScript
- **Tailwind CSS** — Utility-first styling
- **Zod** — Runtime validation
- **Jest** — Unit tests

## License

See LICENSE file.

---

Built on Mireye.
