import { fetchFccAsrStructures } from "../fccAsr";

describe("FCC ASR public integration", () => {
  test("handles invalid coordinates without throwing", async () => {
    const result = await fetchFccAsrStructures(999, 999, 1);
    expect(result.structures).toEqual([]);
    expect(result.queryLat).toBe(999);
  }, 20000);
});
