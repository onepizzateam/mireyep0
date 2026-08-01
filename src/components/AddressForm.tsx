"use client";

import { useState, FormEvent, useRef, useEffect, useCallback } from "react";
import { ScoreRequest } from "@/lib/types";

interface AddressFormProps {
  onSubmit: (request: ScoreRequest) => void;
  onSmokeTest?: () => void;
  isLoading: boolean;
}

interface MapboxFeature {
  id: string;
  properties: {
    full_address?: string;
    name?: string;
    place_formatted?: string;
  };
  geometry: {
    coordinates: [number, number];
  };
}

interface ResolvedLocation {
  lat: number;
  lng: number;
  displayName: string;
}

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

export default function AddressForm({ onSubmit, onSmokeTest, isLoading }: AddressFormProps) {
  const [address, setAddress] = useState("");
  const [carrier, setCarrier] = useState("");
  const [offeredRate, setOfferedRate] = useState("");
  const [buyoutAmount, setBuyoutAmount] = useState("");
  const [resolved, setResolved] = useState<ResolvedLocation | null>(null);
  const [suggestions, setSuggestions] = useState<MapboxFeature[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load Mapbox GL JS dynamically
  useEffect(() => {
    if (typeof window === "undefined" || (window as any).mapboxgl) {
      if ((window as any).mapboxgl) setMapLoaded(true);
      return;
    }
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://api.mapbox.com/mapbox-gl-js/v3.4.0/mapbox-gl.css";
    document.head.appendChild(link);

    const script = document.createElement("script");
    script.src = "https://api.mapbox.com/mapbox-gl-js/v3.4.0/mapbox-gl.js";
    script.onload = () => setMapLoaded(true);
    document.head.appendChild(script);
  }, []);

  // Init map once GL is loaded and a location is resolved
  useEffect(() => {
    if (!mapLoaded || !resolved || !mapContainerRef.current || mapRef.current) return;
    const mapboxgl = (window as any).mapboxgl;
    mapboxgl.accessToken = MAPBOX_TOKEN;

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: [resolved.lng, resolved.lat],
      zoom: 15,
    });

    const marker = new mapboxgl.Marker({ draggable: true, color: "#000000" })
      .setLngLat([resolved.lng, resolved.lat])
      .addTo(map);

    marker.on("dragend", async () => {
      const lngLat = marker.getLngLat();
      // Reverse geocode to get a display name
      const url = `https://api.mapbox.com/search/geocode/v6/reverse?longitude=${lngLat.lng}&latitude=${lngLat.lat}&access_token=${MAPBOX_TOKEN}&limit=1`;
      try {
        const res = await fetch(url);
        const data = await res.json();
        const feature = data?.features?.[0];
        const name = feature?.properties?.full_address ?? feature?.properties?.name ?? `${lngLat.lat.toFixed(5)}, ${lngLat.lng.toFixed(5)}`;
        setResolved({ lat: lngLat.lat, lng: lngLat.lng, displayName: name });
        setAddress(name);
      } catch {
        setResolved({ lat: lngLat.lat, lng: lngLat.lng, displayName: `${lngLat.lat.toFixed(5)}, ${lngLat.lng.toFixed(5)}` });
      }
    });

    mapRef.current = map;
    markerRef.current = marker;
  }, [mapLoaded, resolved]);

  // Move marker when resolved location changes (from suggestion selection)
  useEffect(() => {
    if (!mapRef.current || !markerRef.current || !resolved) return;
    markerRef.current.setLngLat([resolved.lng, resolved.lat]);
    mapRef.current.flyTo({ center: [resolved.lng, resolved.lat], zoom: 15 });
  }, [resolved]);

  const fetchSuggestions = useCallback(async (text: string) => {
    if (!text.trim() || text.trim().toUpperCase() === "NO BUENO") {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    try {
      const url = `https://api.mapbox.com/search/geocode/v6/forward?q=${encodeURIComponent(text)}&access_token=${MAPBOX_TOKEN}&country=us&limit=5&autocomplete=true`;
      const res = await fetch(url);
      const data = await res.json();
      const features: MapboxFeature[] = data?.features ?? [];
      setSuggestions(features);
      setShowSuggestions(features.length > 0);
    } catch {
      setSuggestions([]);
    }
  }, []);

  const handleAddressChange = (value: string) => {
    setAddress(value);
    setResolved(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(value), 300);
  };

  const handleSelectSuggestion = (feature: MapboxFeature) => {
    const [lng, lat] = feature.geometry.coordinates;
    const name = feature.properties.full_address ?? feature.properties.place_formatted ?? feature.properties.name ?? address;
    setAddress(name);
    setResolved({ lat, lng, displayName: name });
    setSuggestions([]);
    setShowSuggestions(false);
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();

    if (address.trim().toUpperCase() === "NO BUENO") {
      onSmokeTest?.();
      return;
    }

    const request: ScoreRequest = {
      address: resolved?.displayName ?? address,
      carrier: carrier.trim() || undefined,
      offeredRate: offeredRate ? parseFloat(offeredRate) : undefined,
      buyoutAmount: buyoutAmount ? parseFloat(buyoutAmount) : undefined,
      lat: resolved?.lat ?? undefined,
      lng: resolved?.lng ?? undefined,
    };

    onSubmit(request);
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl mx-auto space-y-3">
      <div>
        <label htmlFor="address" className="block text-xs font-medium text-gray-700 mb-1">
          Address *
        </label>
        <div className="relative" ref={suggestionsRef}>
          <input
            id="address"
            type="text"
            placeholder="123 Main St, Phoenix AZ"
            value={address}
            onChange={(e) => handleAddressChange(e.target.value)}
            disabled={isLoading}
            autoComplete="off"
            className="w-full px-3 py-2 border border-gray-300 rounded text-sm font-mono focus:outline-none focus:ring-1 focus:ring-black disabled:bg-gray-50"
          />
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 bg-white border border-gray-300 border-t-0 rounded-b shadow-lg z-10">
              {suggestions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => handleSelectSuggestion(s)}
                  className="w-full text-left px-3 py-2 text-sm font-mono text-gray-700 hover:bg-gray-100 border-b border-gray-200 last:border-b-0"
                >
                  {s.properties.full_address ?? s.properties.place_formatted ?? s.properties.name}
                </button>
              ))}
            </div>
          )}
        </div>
        {resolved && (
          <p className="text-xs text-green-700 mt-1 font-mono">
            ✓ Pinned: {resolved.lat.toFixed(5)}, {resolved.lng.toFixed(5)}
          </p>
        )}
      </div>

      {/* Map — shows once a location is resolved */}
      {resolved && (
        <div
          ref={mapContainerRef}
          className="w-full rounded border border-gray-200 overflow-hidden"
          style={{ height: "220px" }}
        />
      )}
      {resolved && (
        <p className="text-xs text-gray-400 font-mono -mt-1">
          Drag the pin to adjust the exact location.
        </p>
      )}

      <div>
        <label htmlFor="carrier" className="block text-xs font-medium text-gray-700 mb-1">
          Carrier / Tower Company (optional)
        </label>
        <input
          id="carrier"
          type="text"
          placeholder="Crown Castle, Verizon, AT&T, T-Mobile, SBA..."
          value={carrier}
          onChange={(e) => setCarrier(e.target.value)}
          disabled={isLoading}
          className="w-full px-3 py-2 border border-gray-300 rounded text-sm font-mono focus:outline-none focus:ring-1 focus:ring-black disabled:bg-gray-50"
        />
      </div>

      <div>
        <label htmlFor="offeredRate" className="block text-xs font-medium text-gray-700 mb-1">
          Current or offered monthly rate (optional)
        </label>
        <input
          id="offeredRate"
          type="number"
          placeholder="1200"
          value={offeredRate}
          onChange={(e) => setOfferedRate(e.target.value)}
          disabled={isLoading}
          min="0"
          className="w-full px-3 py-2 border border-gray-300 rounded text-sm font-mono focus:outline-none focus:ring-1 focus:ring-black disabled:bg-gray-50"
        />
      </div>

      <div>
        <label htmlFor="buyoutAmount" className="block text-xs font-medium text-gray-700 mb-1">
          Buyout offer (optional)
        </label>
        <input
          id="buyoutAmount"
          type="number"
          placeholder="95000"
          value={buyoutAmount}
          onChange={(e) => setBuyoutAmount(e.target.value)}
          disabled={isLoading}
          min="0"
          className="w-full px-3 py-2 border border-gray-300 rounded text-sm font-mono focus:outline-none focus:ring-1 focus:ring-black disabled:bg-gray-50"
        />
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className="w-full bg-black hover:shadow-md disabled:opacity-60 text-white text-sm font-medium py-2 transition"
        style={{ borderRadius: "4px" }}
      >
        {isLoading ? "Running valuation..." : "Run valuation"}
      </button>
    </form>
  );
}