/**
 * Leverage Summary Generator
 * Rule-based, plain-English negotiation summary
 * Per AGENTS.md Section 8
 */

import { SiteScore, MireyeFields } from "./types";

/**
 * Generate 2–3 plain-English sentences summarizing the landlord's negotiating position
 */
export function generateLeverageSummary(
  siteScore: SiteScore,
  fields: MireyeFields,
  offeredRate?: number,
  buyoutAmount?: number
): string[] {
  const sentences: string[] = [];

  // Extract key metrics
  const dim1 = siteScore.dimensions.coverageNecessity.raw;
  const dim2 = siteScore.dimensions.subscriberValue.raw;
  const multiplier = siteScore.multiplier;
  const final = siteScore.final;
  const flags = siteScore.permittingFriction.flags;

  // Primary leverage driver: Coverage Necessity
  if (dim1 > 75 && (fields.antenna_structures_within_500m_count ?? 0) === 0) {
    sentences.push(
      "The carrier has no registered antenna structures within 500 meters — your site is the only viable option in the standard search ring."
    );
  } else if (dim1 > 75 && (fields.antenna_structures_within_2km_count ?? 0) <= 1) {
    sentences.push(
      "Limited competitive density within the carrier's search ring gives you significant negotiating leverage."
    );
  }

  // FCC tenancy caveat — always shown if nearest structure type is guyed
  if (
    fields.nearest_antenna_structure_type === "guyed" &&
    (fields.antenna_structures_within_2km_count ?? 0) > 0
  ) {
    sentences.push(
      "The nearest structure is a guyed tower — structure type suggests additional co-location may be possible, but actual tenant count is not publicly verifiable from available data. Confirm with the carrier before conceding on competition."
    );
  }

  // Subscriber value
  if (dim2 > 70) {
    const typeLabel =
      siteScore.siteType === "urban"
        ? "urban"
        : siteScore.siteType === "suburban"
          ? "suburban"
          : "rural";
    sentences.push(
      `This area's population density places it in the top subscriber-value tier for ${typeLabel} sites — carriers generate significant revenue per site here.`
    );
  }

  // Permitting friction (if high)
  if (multiplier > 1.4 && flags.length > 0) {
    const topFlag = flags[0];
    sentences.push(
      `${topFlag} — this significantly raises the carrier's cost of finding an alternative site.`
    );
  }

  // Overall leverage conclusion
  if (sentences.length < 3) {
    if (final > 75) {
      sentences.push("Overall leverage is high. Open well above the offered rate.");
    } else if (final > 55) {
      sentences.push(
        "Leverage is moderate. You have room to negotiate but the carrier has some alternatives."
      );
    } else {
      sentences.push(
        "Leverage is limited. The carrier has viable alternatives — negotiate on terms (escalators, co-location rights) rather than base rate alone."
      );
    }
  }

  // Buyout special case
  if (buyoutAmount) {
    sentences.push(
      "Buyout offers from lease aggregators are opening positions. Counter at the midpoint of the fair value range or request a competing bid before accepting."
    );
  }

  // Cap at 3 sentences
  return sentences.slice(0, 3);
}
