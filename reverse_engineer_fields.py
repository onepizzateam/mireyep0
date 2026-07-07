#!/usr/bin/env python3
"""
Reverse-engineer which fields have values by analyzing dimension scores
"""

import json

with open("audit_results.json") as f:
    results = json.load(f)

location = results["Rural Arizona (Flagstaff area farmland)"]

print("="*80)
print("REVERSE-ENGINEERING WHICH FIELDS HAVE VALUES")
print("="*80)

print("\nDimension Scores (from computation):")
print(f"  Dim1 (Coverage Necessity): {location['dim1_coverage']}")
print(f"  Dim2 (Subscriber Value): {location['dim2_subscriber']}")
print(f"  Dim3 (Construction Cost): {location['dim3_construction']}")

print("\nAnalysis:")
print("Dim3 = 66.25 suggests bedrock_depth, slope, or drainage had values")
print("  (null fields would average to 60 with other nulls)")

print("\nDim2 = 39 suggests maybe 1-2 housing-related fields had values")
print("  (heavy null field penalty brought average down)")

print("\nDim1 = 43.1 suggests some road or coverage fields had values")
print("  (antenna structures appear to be null given same score across all sites)")

print("\n" + "="*80)
print("DATA GAPS AFFECTING THIS LOCATION")
print("="*80)

gaps = location.get('data_gaps', [])
print(f"\nTotal gaps: {location['data_gaps_count']}")
print(f"Visible gaps (first 5): {gaps}")

# Check if antenna structure type was available
if 'nearest_antenna_structure_type' in gaps:
    print("\n⚠️  nearest_antenna_structure_type is NULL")
    print("   → FCC tenancy caveat will NOT fire (critical disclosure missing)")
else:
    print("\n✓ nearest_antenna_structure_type is available")

# Check friction fields
friction_gaps = [g for g in gaps if 'wetland' in g.lower() or 'protected' in g.lower()]
if friction_gaps:
    print(f"\n⚠️  Friction fields null: {friction_gaps}")
    print("   → Permitting multiplier logic broken")
else:
    print("\n✓ Friction fields available (but all show 0.85x baseline)")

print("\n" + "="*80)
print("CONCLUSION")
print("="*80)
print("\nMireye is returning ~21 fields (60 - 39 gaps) but they're apparently:")
print("  1. NOT the critical differentiation fields (antenna structures, density)")
print("  2. Mostly construction/climate fields that yield neutral/default scores")
print("  3. Missing permitting friction data entirely")
print("\n→ Even the ~21 returned fields are not the score-critical ones")
