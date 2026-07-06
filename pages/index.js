import React, { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';

export default function Home() {
  const mapRef = useRef();
  const [selected, setSelected] = useState(null);
  const [explain, setExplain] = useState(null);
  const [top10, setTop10] = useState([]);

  useEffect(() => {
    // load top10
    fetch('/data/top10.json').then(r=>r.json()).then(setTop10).catch(()=>{});

    let mapboxgl;
    let map;
    (async () => {
      mapboxgl = (await import('mapbox-gl')).default;
      mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';
      map = new mapboxgl.Map({ container: 'map', style: 'https://demotiles.maplibre.org/style.json', center: [-112.0740,33.4484], zoom: 10 });
      mapRef.current = map;

      map.on('load', () => {
        fetch('/data/tracts_with_scores.geojson').then(r=>r.json()).then(geo=>{
          map.addSource('tracts', { type: 'geojson', data: geo });

          const geomType = (geo.features && geo.features[0] && geo.features[0].geometry && geo.features[0].geometry.type) || 'Point';
          if (geomType === 'Point' || geomType === 'MultiPoint') {
            map.addLayer({
              id: 'tracts-circle',
              type: 'circle',
              source: 'tracts',
              paint: {
                'circle-radius': 8,
                'circle-color': [
                  'interpolate', ['linear'], ['get','heat_score'],
                  0, '#2DC4B2',
                  0.4, '#FFEDA0',
                  0.7, '#FF6B6B',
                  1, '#800026'
                ],
                'circle-stroke-width': 1,
                'circle-stroke-color': '#222'
              }
            });

            map.on('click', 'tracts-circle', (e) => {
              const f = e.features[0];
              const coords = f.geometry.coordinates;
              const lat = coords[1], lng = coords[0];
              setSelected({ lat, lng, props: f.properties });
              setExplain({ loading: true });
              fetch('/api/ask', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ lat, lng, question: 'Explain the main contributors to heat risk at this location.' })
                }).then(r=>r.json()).then(data=>setExplain(data)).catch(err=>setExplain({ error: String(err) }));
            });

          } else {
            // polygons / multipolygons: show fills and use click lngLat for requests
            map.addLayer({
              id: 'tracts-fill',
              type: 'fill',
              source: 'tracts',
              paint: {
                'fill-color': [
                  'interpolate', ['linear'], ['get','heat_score'],
                  0, '#2DC4B2',
                  0.4, '#FFEDA0',
                  0.7, '#FF6B6B',
                  1, '#800026'
                ],
                'fill-opacity': 0.7
              }
            });
            map.addLayer({
              id: 'tracts-line',
              type: 'line',
              source: 'tracts',
              paint: { 'line-color': '#222', 'line-width': 1 }
            });

            map.on('click', 'tracts-fill', (e) => {
              const f = e.features[0];
              const lng = e.lngLat.lng, lat = e.lngLat.lat;
              setSelected({ lat, lng, props: f.properties });
              setExplain({ loading: true });
              fetch('/api/ask', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lat, lng, question: 'Explain the main contributors to heat risk at this location.' })
              }).then(r=>r.json()).then(data=>setExplain(data)).catch(err=>setExplain({ error: String(err) }));
            });
          }

        });
      });
    })();

    return () => { if (mapRef.current) mapRef.current.remove(); };
  }, []);

  return (
    <div style={{display:'flex',height:'100vh'}}>
      <div id="map" style={{flex:1}} />
      <div style={{width:340,padding:12,boxShadow:'-2px 0 6px rgba(0,0,0,0.1)',overflow:'auto'}}>
        <h2>Top Ranked Tracts</h2>
        <ul>
          {top10.map((t, i)=>(
            <li key={i} style={{marginBottom:8}}>
              <strong>{t.tier}</strong> — score {Number(t.score).toFixed(2)}
              <div style={{fontSize:12,color:'#666'}}>{JSON.stringify(t.fields)}</div>
            </li>
          ))}
        </ul>
        <hr />
        <h3>Selected</h3>
        {selected ? (
          <div>
            <div>Lat: {selected.lat.toFixed(6)}, Lng: {selected.lng.toFixed(6)}</div>
            <div>Score: {Number(selected.props.heat_score).toFixed(2)}</div>
            {selected.props.recommendation ? <div><strong>Recommendation:</strong> {selected.props.recommendation}</div> : null}
            {selected.props._mireye ? (
              <div style={{fontSize:12,color:'#444',marginTop:6}}>
                <div>Coverage: {Number(selected.props._mireye.coverage_pct || 0).toFixed(0)}%</div>
                <div>Built fraction: {selected.props._mireye.built_fraction != null ? Number(selected.props._mireye.built_fraction).toFixed(2) : 'n/a'}</div>
              </div>
            ) : null}
            <button onClick={()=>{ if (selected) { fetch('/api/ask', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({lat:selected.lat,lng:selected.lng,question:'Explain the main contributors to heat risk at this location.'})}).then(r=>r.json()).then(setExplain).catch(e=>setExplain({error:String(e)})) }}}>Explain</button>
            <pre style={{whiteSpace:'pre-wrap'}}>{explain ? (explain.loading ? 'Loading explanation...' : (explain.answer || JSON.stringify(explain,null,2))) : 'No explanation yet'}</pre>
          </div>
        ) : <div>Click a point on the map to inspect.</div>}
        <hr />
        <h4>Limitations</h4>
        <div style={{fontSize:12,color:'#666'}}>
          - `built_fraction` is a derived proxy, not a continuous imperviousness raster.
          <br />- `days_above_32c_annual_count` is CONUS-only and coarse (~5km).
          <br />- Census-tract resolution is for triage, not street-level decisions.
        </div>
      </div>
    </div>
  );
}
