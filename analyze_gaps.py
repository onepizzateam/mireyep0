#!/usr/bin/env python3
"""
Parse audit results to identify which fields are null and which have values
"""

import json

with open("audit_results.json") as f:
    results = json.load(f)

# Pick the first result to analyze
first_result = results["Rural Arizona (Flagstaff area farmland)"]

print("="*80)
print("FIELD ANALYSIS")
print("="*80)
print(f"\nLocation: {first_result['address']}")
print(f"Total Data Gaps: {first_result['data_gaps_count']}")
print(f"Data Gaps List (showing first 5):")
for gap in first_result['data_gaps'][:5]:
    print(f"  - {gap}")

print(f"\nDimension Contributions (top fields that DID fire):")

# The response should have what fired
print(f"\nDimension 1 (Coverage Necessity): {first_result['dim1_coverage']}")
print(f"Dimension 2 (Subscriber Value): {first_result['dim2_subscriber']}")
print(f"Dimension 3 (Construction Cost): {first_result['dim3_construction']}")

print(f"\nPermitting Friction: {first_result['multiplier']}x")
print(f"Friction Flags: {first_result['friction_flags']}")

# The real issue: let's check if this is because ALL sites are returning the same Mireye data
print("\n" + "="*80)
print("CRITICAL ISSUE: ALL 5 LOCATIONS IDENTICAL")
print("="*80)

for name, res in results.items():
    print(f"{name:<45} Score: {res['final_score']}, Multiplier: {res['multiplier']}x")

print("\n⚠️ All 5 completely different geographic locations returned:")
print("    - IDENTICAL scores (40.343125)")
print("    - IDENTICAL multipliers (0.85)")
print("    - IDENTICAL dimension scores")
print("    - IDENTICAL benchmark ranges")
print("\nThis indicates one of:")
print("  1. Mireye is returning IDENTICAL cached data for all requests")
print("  2. The batch merge is failing silently and returning same fields every time")
print("  3. The scoring logic has hardcoded fallback values")
print("  4. The batch 2 response is overwriting batch 1 identically")
