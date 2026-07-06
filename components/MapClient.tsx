'use client'
import React, { useEffect, useRef, useState } from 'react'

export default function MapClient(){
  const mapRef = useRef<any>(null);
  const [top10, setTop10] = useState<any[]>([]);

  useEffect(()=>{
    let cancelled = false;
    (async ()=>{
      const mapboxgl = (await import('mapbox-gl')).default;
      mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';
      const map = new mapboxgl.Map({ container: 'map', style: 'https://demotiles.maplibre.org/style.json', center: [-112.0740,33.4484], zoom: 10 });
      mapRef.current = map;
      map.on('load', async ()=>{
        try{
          const geo = await (await fetch('/data/tracts_with_scores.geojson')).json();
          map.addSource('tracts',{type:'geojson',data:geo});
          const geomType = geo.features && geo.features[0] && geo.features[0].geometry && geo.features[0].geometry.type || 'Point';
          if (geomType === 'Point' || geomType === 'MultiPoint'){
            map.addLayer({ id:'tracts-circle', type:'circle', source:'tracts', paint:{ 'circle-radius':8, 'circle-color':['interpolate',['linear'],['get','heat_score'],0,'#2DC4B2',0.4,'#FFEDA0',0.7,'#FF6B6B',1,'#800026'], 'circle-stroke-width':1,'circle-stroke-color':'#222' } });
            map.on('click','tracts-circle', (e:any)=>{ const f=e.features[0]; const coords = f.geometry.coordinates; const lat=coords[1], lng=coords[0]; selectFeature({lat,lng,props:f.properties}); });
          } else {
            map.addLayer({ id:'tracts-fill', type:'fill', source:'tracts', paint:{ 'fill-color':['interpolate',['linear'],['get','heat_score'],0,'#2DC4B2',0.4,'#FFEDA0',0.7,'#FF6B6B',1,'#800026'], 'fill-opacity':0.7 } });
            map.addLayer({ id:'tracts-line', type:'line', source:'tracts', paint:{'line-color':'#222','line-width':1} });
            map.on('click','tracts-fill',(e:any)=>{ const f=e.features[0]; const lat=e.lngLat.lat, lng=e.lngLat.lng; selectFeature({lat,lng,props:f.properties}); });
          }
          // populate top10 panel
          const top = await (await fetch('/data/top10.json')).json();
          if (!cancelled) setTop10(top);
          const el = document.getElementById('toplist');
          if (el) el.innerHTML = top.map((t:any)=>`<div class='mb-2'><strong>${t.tier}</strong> — ${t.score.toFixed(2)}<div class='text-xs text-gray-500'>${JSON.stringify(t.fields)}</div></div>`).join('');
        }catch(e){ console.error(e); }
      });

      function selectFeature(obj:any){
        // push a browser event for the sidebar to pick up (simple approach)
        window.dispatchEvent(new CustomEvent('tract:selected', { detail: obj }));
      }
    })();
    return ()=>{ cancelled=true; if (mapRef.current) mapRef.current.remove(); }
  },[]);

  return <div id="map" style={{width:'100%',height:'100%'}} />
}
