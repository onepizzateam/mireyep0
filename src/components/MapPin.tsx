"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

// Set Mapbox token from environment
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

interface MapPinProps {
  initialLat: number;
  initialLng: number;
  onCoordinateChange: (lat: number, lng: number) => void;
}

export default function MapPin({
  initialLat,
  initialLng,
  onCoordinateChange,
}: MapPinProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const marker = useRef<mapboxgl.Marker | null>(null);
  const [currentLat, setCurrentLat] = useState(initialLat);
  const [currentLng, setCurrentLng] = useState(initialLng);

  useEffect(() => {
    if (!mapContainer.current || !MAPBOX_TOKEN) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/light-v11",
      center: [initialLng, initialLat],
      zoom: 15,
      scrollZoom: true,
      dragPan: true,
      interactive: true,
    });

    // Create draggable marker
    const el = document.createElement("div");
    el.style.width = "32px";
    el.style.height = "32px";
    el.style.backgroundImage = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23000000'><path d='M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z'/></svg>")`;
    el.style.backgroundSize = "contain";
    el.style.backgroundRepeat = "no-repeat";
    el.style.cursor = "grab";

    marker.current = new mapboxgl.Marker({ element: el, draggable: true })
      .setLngLat([initialLng, initialLat])
      .addTo(map.current);

    // Handle marker drag
    marker.current.on("dragend", () => {
      if (marker.current) {
        const lngLat = marker.current.getLngLat();
        const newLat = lngLat.lat;
        const newLng = lngLat.lng;
        setCurrentLat(newLat);
        setCurrentLng(newLng);
        onCoordinateChange(newLat, newLng);
      }
    });

    return () => {
      map.current?.remove();
    };
  }, [initialLat, initialLng, onCoordinateChange]);

  // Format coordinates for display (DMS or decimal)
  const formatCoordinate = (value: number, isLatitude: boolean): string => {
    const absValue = Math.abs(value);
    const degrees = Math.floor(absValue);
    const minutes = Math.floor((absValue - degrees) * 60);
    const seconds = ((absValue - degrees) * 60 - minutes) * 60;
    
    const direction = isLatitude
      ? value >= 0
        ? "N"
        : "S"
      : value >= 0
        ? "E"
        : "W";

    return `${degrees}° ${minutes}' ${seconds.toFixed(2)}" ${direction}`;
  };

  return (
    <div className="space-y-2">
      <div
        ref={mapContainer}
        style={{
          height: "300px",
          width: "100%",
          border: "1px solid #E5E5E5",
          borderRadius: "4px",
        }}
      />
      <p className="text-xs font-mono text-gray-600 text-center">
        {formatCoordinate(currentLat, true)}, {formatCoordinate(currentLng, false)} —{" "}
        <span className="text-gray-500">drag to adjust</span>
      </p>
      <p className="text-xs text-gray-600 text-center">
        Drag the pin to the exact location — tower leases are typically signed on parcel corners near roads, not address centroids.
      </p>
    </div>
  );
}
