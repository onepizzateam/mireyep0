#!/usr/bin/env python3
"""
Full end-to-end audit of SignalRent application
Tests 5 coordinates and captures score, benchmark, and multiplier data
"""

import requests
import json
import time
from typing import Dict, Any

BASE_URL = "http://localhost:3000/api/score"

test_locations = [
    {
        "name": "Rural Arizona (Flagstaff area farmland)",
        "address": "Flagstaff, Arizona",
        "expected": "high leverage, low competition"
    },
    {
        "name": "Suburban Phoenix (Derek scenario)",
        "address": "Phoenix, Arizona",
        "expected": "mid-range, moderate competition"
    },
    {
        "name": "Manhattan rooftop",
        "address": "Manhattan, New York",
        "expected": "max urban, max subscriber value, max competition"
    },
    {
        "name": "Rural Tennessee wetland",
        "address": "Tennessee",
        "expected": "high permitting friction from wetlands"
    },
    {
        "name": "Interstate highway edge, Texas",
        "address": "Texas Interstate",
        "expected": "high coverage necessity from road class"
    }
]

def test_all_locations():
    """Test all 5 locations and capture detailed response data"""
    results = {}
    
    for i, loc in enumerate(test_locations, 1):
        print(f"\n{'='*70}")
        print(f"COORDINATE {i}: {loc['name']}")
        print(f"Address: {loc['address']}")
        print(f"Expected: {loc['expected']}")
        print(f"{'='*70}")
        
        payload = {"address": loc["address"]}
        
        try:
            start = time.time()
            response = requests.post(BASE_URL, json=payload, timeout=60)
            elapsed = time.time() - start
            
            print(f"Status: {response.status_code} (took {elapsed:.1f}s)")
            
            data = response.json()
            
            if data.get("ok"):
                score_data = data.get("score", {})
                benchmark = data.get("benchmark", {})
                leverage = data.get("leverageSummary", [])
                dims = score_data.get("dimensions", {})
                
                # Store results
                results[loc["name"]] = {
                    "ok": True,
                    "address": data.get("displayAddress"),
                    "lat": data.get("lat"),
                    "lng": data.get("lng"),
                    "final_score": score_data.get("final"),
                    "baseline": score_data.get("baseline"),
                    "multiplier": score_data.get("multiplier"),
                    "site_type": score_data.get("siteType"),
                    "dim1_coverage": dims.get("coverageNecessity", {}).get("raw"),
                    "dim2_subscriber": dims.get("subscriberValue", {}).get("raw"),
                    "dim3_construction": dims.get("constructionCost", {}).get("raw"),
                    "benchmark_min": benchmark.get("monthlyRange", {}).get("min"),
                    "benchmark_max": benchmark.get("monthlyRange", {}).get("max"),
                    "benchmark_band": benchmark.get("scoreBand"),
                    "site_type_classified": benchmark.get("siteType"),
                    "data_gaps_count": len(data.get("dataGaps", [])),
                    "data_gaps": data.get("dataGaps", [])[:5],  # First 5 gaps
                    "friction_flags": score_data.get("permittingFriction", {}).get("flags", []),
                    "leverage_summary": leverage,
                }
                
                print(f"\n✓ Score: {score_data.get('final')}/100")
                print(f"  Location: {data.get('displayAddress')}")
                print(f"  Baseline: {score_data.get('baseline'):.1f}")
                print(f"  Multiplier: {score_data.get('multiplier')}x")
                print(f"  Site Type: {score_data.get('siteType')}")
                print(f"  Coverage Necessity: {dims.get('coverageNecessity', {}).get('raw'):.1f}")
                print(f"  Subscriber Value: {dims.get('subscriberValue', {}).get('raw'):.1f}")
                print(f"  Construction Cost: {dims.get('constructionCost', {}).get('raw'):.1f}")
                print(f"  Benchmark Range: ${benchmark.get('monthlyRange', {}).get('min')}-${benchmark.get('monthlyRange', {}).get('max')}/mo")
                print(f"  Score Band: {benchmark.get('scoreBand')}")
                print(f"  Data Gaps: {len(data.get('dataGaps', []))} fields")
                
                if leverage:
                    print(f"  Leverage Summary: {leverage[0][:80]}...")
                
                permitting = score_data.get("permittingFriction", {})
                if permitting.get("flags"):
                    print(f"  Permitting Friction Flags:")
                    for flag in permitting.get("flags", []):
                        print(f"    - {flag[:70]}")
                
            else:
                print(f"✗ Error: {data.get('error', 'Unknown error')}")
                results[loc["name"]] = {"ok": False, "error": data.get('error')}
                
        except Exception as e:
            print(f"✗ Request failed: {e}")
            results[loc["name"]] = {"ok": False, "error": str(e)}
    
    return results

def print_summary(results: Dict[str, Any]):
    """Print summary table of all results"""
    print(f"\n\n{'='*100}")
    print("SUMMARY TABLE")
    print(f"{'='*100}")
    print(f"{'Location':<35} {'Score':>8} {'Multi':>6} {'Dim1':>6} {'Dim2':>6} {'Dim3':>6} {'Range':>15}")
    print(f"{'-'*100}")
    
    for name, result in results.items():
        if result.get("ok"):
            print(f"{name:<35} {result['final_score']:>8.1f} {result['multiplier']:>6.2f}x {result['dim1_coverage']:>6.1f} {result['dim2_subscriber']:>6.1f} {result['dim3_construction']:>6.1f} ${result['benchmark_min']:>4.0f}-${result['benchmark_max']:<4.0f}")
        else:
            print(f"{name:<35} ERROR: {result.get('error', 'Unknown')}")

if __name__ == "__main__":
    results = test_all_locations()
    print_summary(results)
    
    # Write detailed results to file
    with open("audit_results.json", "w") as f:
        json.dump(results, f, indent=2)
    print(f"\n✓ Detailed results saved to audit_results.json")
