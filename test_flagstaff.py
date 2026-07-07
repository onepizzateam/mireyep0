#!/usr/bin/env python3
import requests
import time

payload = {'address': 'Flagstaff, Arizona'}
try:
    start = time.time()
    response = requests.post('http://localhost:3000/api/score', json=payload, timeout=45)
    elapsed = time.time() - start
    
    print(f'Response time: {elapsed:.1f}s')
    
    data = response.json()
    if data.get('ok'):
        score = data['score']['final']
        gaps = len(data.get('dataGaps', []))
        baseline = data['score']['baseline']
        mult = data['score']['multiplier']
        dims = data['score']['dimensions']
        bench = data.get('benchmark', {})
        
        print(f'Flagstaff: Score {score:.1f}/100')
        print(f'  Baseline: {baseline:.1f}, Multiplier: {mult}x')
        print(f'  Dim1 (Coverage): {dims.get("coverageNecessity", {}).get("raw"):.1f}')
        print(f'  Dim2 (Subscriber): {dims.get("subscriberValue", {}).get("raw"):.1f}')
        print(f'  Dim3 (Construction): {dims.get("constructionCost", {}).get("raw"):.1f}')
        print(f'  Benchmark: ${bench.get("monthlyRange", {}).get("min")}-${bench.get("monthlyRange", {}).get("max")}/mo')
        print(f'  Data gaps: {gaps}')
        print(f'  Site type: {data.get("score", {}).get("siteType")}')
    else:
        print(f'Error: {data.get("error")}')
except Exception as e:
    print(f'Failed: {e}')
