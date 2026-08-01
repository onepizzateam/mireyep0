import { computeSiteScore } from "../score";
import { MIREYE_FIELDS } from "@/constants/fields";

describe("computeSiteScore tower saturation", () => {
  const fields = { ...Object.fromEntries(MIREYE_FIELDS.map((name) => [name, null])), antenna_structures_within_500m_count: 0, antenna_structures_within_2km_count: 0, housing_units_within_1km: 1000 } as any;
  test("saturation raises coverage necessity", () => expect(computeSiteScore(fields, ["Verizon", "AT&T", "T-Mobile", "DISH"], "GTOWER").dimensions.coverageNecessity.raw).toBeGreaterThan(computeSiteScore(fields).dimensions.coverageNecessity.raw));
  test("open capacity lowers coverage necessity", () => expect(computeSiteScore(fields, ["Verizon"], "MONOPOLE").dimensions.coverageNecessity.raw).toBeLessThan(computeSiteScore(fields).dimensions.coverageNecessity.raw));
  test("baseline uses domain weights", () => { const s = computeSiteScore(fields); expect(s.baseline).toBeCloseTo(s.dimensions.coverageNecessity.raw * .4 + s.dimensions.subscriberValue.raw * .35 + s.dimensions.constructionCost.raw * .25, 2); });
});
