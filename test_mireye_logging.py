#!/usr/bin/env python3
import requests
import time

payload = {'address': 'Boston, Massachusetts'}
try:
    print("Testing Boston...")
    start = time.time()
    response = requests.post('http://localhost:3000/api/score', json=payload, timeout=40)
    elapsed = time.time() - start
    
    print(f'Response received in {elapsed:.1f}s (HTTP {response.status_code})')
    
    data = response.json()
    if data.get('ok'):
        score = data['score']['final']
        gaps = len(data.get('dataGaps', []))
        print(f'✓ Score: {score}, Data gaps: {gaps}')
    else:
        print(f"✗ Error: {data.get('error')}")
except requests.exceptions.Timeout:
    print("✗ Request timed out (40s)")
except Exception as e:
    print(f'✗ Request failed: {e}')

print("\nCheck dev server logs for enhanced Mireye diagnostics...")
