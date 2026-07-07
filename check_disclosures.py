#!/usr/bin/env python3
import json

with open('audit_results.json') as f:
    results = json.load(f)
    
loc = results['Rural Arizona (Flagstaff area farmland)']

print('DATA GAPS FOR FLAGSTAFF:')
for gap in loc['data_gaps'][:10]:
    print(f'  - {gap}')
    
print(f'\nTotal data gaps: {loc["data_gaps_count"]}')

print('\nLEVERAGE SUMMARY:')
for msg in loc.get('leverage_summary', []):
    print(f'  {msg}')

print('\nPERMITTING FRICTION FLAGS:')
if loc.get('friction_flags'):
    for flag in loc['friction_flags']:
        print(f'  - {flag}')
else:
    print('  (none)')

# Check all locations for FCC tenancy gaps
print('\n' + '='*70)
print('FCC TENANCY CAVEAT ACROSS ALL 5 LOCATIONS')
print('='*70)

for name, data in results.items():
    has_fcc = any('FCC' in gap for gap in data.get('data_gaps', []))
    print(f'{name:<40} FCC Caveat: {"✓" if has_fcc else "✗"}')
