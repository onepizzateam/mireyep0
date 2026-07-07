#!/usr/bin/env python3
import json
import urllib.request
import time

url = 'http://localhost:3000/api/score'
test_addresses = [
    ('Chicago, Illinois', 'urban'),
    ('Austin, Texas', 'suburban'),  
    ('Kalispell, Montana', 'rural')
]

print("\n" + "="*70)
print("E2E TEST: Address Scoring with Parallel Batch Fetching")
print("="*70)

for address, expected_type in test_addresses:
    print(f"\n--- Testing: {address} (expected: {expected_type}) ---")
    
    start = time.time()
    
    data = json.dumps({'address': address}).encode('utf-8')
    req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json'})
    
    try:
        with urllib.request.urlopen(req) as response:
            result = json.loads(response.read())
            elapsed = time.time() - start
            
            print(f"✅ API Response: SUCCESS")
            print(f"   Processing time: {result['processingMs']}ms ({elapsed:.2f}s wall time)")
            print(f"   Final Score: {result['score']['final']:.1f}/100")
            print(f"   Baseline: {result['score']['baseline']:.1f}, Multiplier: {result['score']['multiplier']:.2f}x")
            print(f"   Benchmark Range: ${result['benchmark']['monthlyRange']['min']}-${result['benchmark']['monthlyRange']['max']}/month")
            print(f"   Site Type: {result['score']['siteType']}")
            print(f"   Data Gaps: {len(result['dataGaps'])} fields with null values")
            
            print(f"   Dimensions:")
            for dim_name, dim_data in result['score']['dimensions'].items():
                print(f"     • {dim_data['label']}: {dim_data['raw']:.1f}")
                
            print(f"   Leverage Summary:")
            for summary in result['leverageSummary']:
                print(f"     • {summary[:70]}...")
                
    except Exception as e:
        print(f"❌ Error: {e}")
    
    time.sleep(1)

print("\n" + "="*70)
print("E2E Test Complete")
print("="*70)
