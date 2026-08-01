import { computeTowerSaturation, saturationLeverageSentence } from "../towerSaturation";

describe("tower saturation", () => {
  test("handles unknown and empty inputs", () => {
    expect(computeTowerSaturation(null, ["Verizon"])).toBeNull();
    expect(computeTowerSaturation("GTOWER", [])).toBeNull();
  });
  test("guyed tower at 75% is saturated", () => {
    const result = computeTowerSaturation("guyed", ["Verizon", "AT&T", "T-Mobile"]);
    expect(result?.isSaturated).toBe(true);
    expect(result?.pointAdjustment).toBe(12);
  });
  test("monopole with one tenant has open capacity", () => {
    const result = computeTowerSaturation("MONOPOLE", ["Verizon"]);
    expect(result?.maxTenants).toBe(2);
    expect(result?.pointAdjustment).toBe(-8);
  });
  test("sentence includes capacity figures", () => {
    const result = computeTowerSaturation("MONOPOLE", ["Verizon", "AT&T"])!;
    expect(saturationLeverageSentence(result)).toContain("2/2");
  });
});
