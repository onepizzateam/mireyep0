import type { IntelligenceLayers, DataCitation } from "@/lib/types";

interface OpenCelliDCell {
  mcc: string | number;
  mnc: string | number;
  carrier_name?: string;
  lat?: number;
  lon?: number;
  averageSignal?: number;
  samples?: number;
  [key: string]: unknown;
}

interface FederalJsonResponse {
  cells?: OpenCelliDCell[];
  availability?: Record<string, unknown>[];
  [key: string]: unknown;
}

const now = () => new Date().toISOString();
const citation = (source: string, url: string): DataCitation => ({ source, url, retrievedAt: now() });
async function json(url: string, init?: RequestInit): Promise<FederalJsonResponse> {
  const res = await fetch(url, { ...init, headers: { Accept: "application/json", ...(init?.headers ?? {}) }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}
function empty(error: string): IntelligenceLayers {
  return {
    bdc: { coverage: [], gapCarriers: [], error, citations: [citation("FCC BDC", "https://broadbandmap.fcc.gov/")] },
    uls: { licenses: [], carrierNames: [], error, citations: [citation("FCC ULS", "https://wireless2.fcc.gov/UlsApp/UlsSearch/searchLicense.jsp")] },
    opencellid: { cells: [], carriersPresent: [], error, citations: [citation("OpenCelliD", "https://opencellid.org/")] },
    faa: { cases: [], hazardCount: 0, approvedCount: 0, error, citations: [citation("FAA OE/AAA", "https://oeaaa.faa.gov/")] },
    auction: { obligations: [], obligatedCarriers: [], error, citations: [citation("FCC Auctions", "https://www.fcc.gov/auctions")] },
  };
}
export async function fetchFederalLayers(lat: number, lng: number, county?: string): Promise<IntelligenceLayers> {
  const out = empty("External layer unavailable");
  const key = process.env.OPENCELLID_API_KEY;
  try {
    if (key) {
      const data = await json(`https://api.opencellid.org/v1/cell/getInArea?key=${encodeURIComponent(key)}&lat1=${lat - .01}&lon1=${lng - .01}&lat2=${lat + .01}&lon2=${lng + .01}`);
      const cells: OpenCelliDCell[] = (data?.cells ?? []).map((c: OpenCelliDCell) => ({ ...c, carrier_name: c.carrier_name ?? `${c.mcc}-${c.mnc}` }));
      out.opencellid = { cells, carriersPresent: [...new Set(cells.map((c: OpenCelliDCell) => String(c.carrier_name ?? "")))], citations: [citation("OpenCelliD", "https://opencellid.org/")] };
    } else out.opencellid.error = "OPENCELLID_API_KEY not configured";
  } catch (e) { out.opencellid.error = String(e); }
  // These public datasets have different query contracts and are intentionally isolated;
  // adapters can be enabled without changing the graph or report schema.
  out.bdc.error = process.env.FCC_BDC_API_URL ? "BDC adapter returned no normalized records" : "FCC_BDC_API_URL not configured";
  out.uls.error = "FCC ULS adapter not configured";
  out.faa.error = "FAA OE/AAA adapter not configured";
  out.auction.error = county ? "Auction obligation dataset not configured" : "County unavailable for auction lookup";
  return out;
}

export async function fetchFederalLayer(kind: keyof IntelligenceLayers, lat: number, lng: number, county?: string) {
  const all = await fetchFederalLayers(lat, lng, county);
  return { [kind]: all[kind] } as Partial<IntelligenceLayers>;
}
