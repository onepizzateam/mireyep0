#!/usr/bin/env python3
"""
Detailed diagnostic: capture full Mireye response with all 60 fields
"""

import requests
import json

BASE_URL = "http://localhost:3000/api/score"

# Test just one location to see full field data
payload = {"address": "Manhattan, New York"}

response = requests.post(BASE_URL, json=payload, timeout=60)
data = response.json()

if data.get("ok"):
    score_data = data.get("score", {})
    dims = score_data.get("dimensions", {})
    
    print("="*80)
    print("FULL RESPONSE INSPECTION - Manhattan")
    print("="*80)
    print(f"\nScore: {score_data.get('final')}/100")
    print(f"Data Gaps ({len(data.get('dataGaps', []))} fields): {json.dumps(data.get('dataGaps', []), indent=2)}")
    
    print("\n" + "="*80)
    print("TOP FIELD CONTRIBUTIONS (should show which fields actually contributed)")
    print("="*80)
    
    for dim_name, dim_data in dims.items():
        print(f"\n{dim_name}:")
        print(f"  Raw Score: {dim_data.get('raw')}")
        print(f"  Top Fields:")
        for field in dim_data.get('topFields', []):
            print(f"    - {field['fieldName']}: {field['value']} → {field['explanation']}")
    
    print("\n" + "="*80)
    print("PERMITTING FRICTION FLAGS")
    print("="*80)
    perm = score_data.get("permittingFriction", {})
    print(f"Multiplier: {perm.get('multiplierRaw')}")
    print(f"Flags: {json.dumps(perm.get('flags', []), indent=2)}")
    
    # Write full response for inspection
    with open("full_response_manhattan.json", "w") as f:
        json.dump(data, f, indent=2)
    
    print("\n✓ Full response saved to full_response_manhattan.json")
else:
    print(f"Error: {data.get('error')}")
