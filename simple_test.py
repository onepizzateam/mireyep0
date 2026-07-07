#!/usr/bin/env python3
import requests
import time

payload = {'address': 'Seattle, Washington'}
try:
    start = time.time()
    response = requests.post('http://localhost:3000/api/score', json=payload, timeout=60)
    elapsed = time.time() - start
    
    print(f'Response time: {elapsed:.1f}s')
    
    data = response.json()
    if data.get('ok'):
        score = data['score']['final']
        gaps = len(data.get('dataGaps', []))
        print(f'Score: {score}, Data gaps: {gaps}')
    else:
        print(f"Error: {data.get('error')}")
except Exception as e:
    print(f'Request failed: {e}')
