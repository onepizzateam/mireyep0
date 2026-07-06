import dynamic from 'next/dynamic'
import Link from 'next/link'
import React, { useEffect, useState } from 'react'

const MapClient = dynamic(() => import('../components/MapClient'), { ssr: false });

export default function Page() {
  const [city, setCity] = useState('Phoenix, AZ');
  const [status, setStatus] = useState('');

  useEffect(()=>{
    function onSelect(e:any){ const d = e.detail; /* no-op: sidebar receives events via DOM */ }
    window.addEventListener('tract:selected', onSelect as any);
    return ()=> window.removeEventListener('tract:selected', onSelect as any);
  },[]);
  return (
    <div className="flex h-screen">
      <div className="flex-1">
        <MapClient />
      </div>
      <aside className="w-80 p-4 border-l">
        <div className="mb-3">
          <label className="text-sm font-medium">City</label>
          <div className="flex gap-2 mt-1">
            <input value={city} onChange={e=>setCity(e.target.value)} className="border px-2 py-1 flex-1" />
            <button className="bg-sky-600 text-white px-3 rounded" onClick={async ()=>{ setStatus('fetching'); const r=await fetch('/api/fetch_tracts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({city})}); const j=await r.json(); setStatus(j.saved?`saved ${j.saved}`:j.error||'error'); }}>Fetch</button>
          </div>
          <div className="text-xs text-gray-500 mt-1">{status}</div>
        </div>
        <h2 className="text-lg font-semibold">Top Ranked Tracts</h2>
        <div id="toplist" />
        <div className="mt-4">
          <h3 className="font-medium">Limitations</h3>
          <ul className="text-sm text-gray-600 list-disc ml-5">
            <li><code>built_fraction</code> is a derived proxy, not a continuous imperviousness raster.</li>
            <li><code>days_above_32c_annual_count</code> is CONUS-only and coarse (~5km).</li>
            <li>Census-tract resolution is for triage, not street-level decisions.</li>
          </ul>
        </div>
      </aside>
    </div>
  )
}
