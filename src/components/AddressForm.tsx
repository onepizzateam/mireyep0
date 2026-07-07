"use client";

import { useState, FormEvent, useRef, useEffect } from "react";
import { ScoreRequest } from "@/lib/types";
import MapPin from "./MapPin";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

interface AddressFormProps {
  onSubmit: (request: ScoreRequest) => void;
  isLoading: boolean;
}

interface GeocodeResult {
  lat: number;
  lng: number;
  displayName: string;
}

export default function AddressForm({ onSubmit, isLoading }: AddressFormProps) {
  const [address, setAddress] = useState("");
  const [carrier, setCarrier] = useState("");
  const [offeredRate, setOfferedRate] = useState("");
  const [buyoutAmount, setBuyoutAmount] = useState("");
  
  // Map state
  const [geocodedLocation, setGeocodedLocation] = useState<GeocodeResult | null>(null);
  const [confirmedLat, setConfirmedLat] = useState<number | null>(null);
  const [confirmedLng, setConfirmedLng] = useState<number | null>(null);
  const [addressSuggestions, setAddressSuggestions] = useState<GeocodeResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Mapbox geocoder forward search
  const handleAddressSearch = async (searchText: string) => {
    setAddress(searchText);
    
    if (!searchText.trim() || !MAPBOX_TOKEN) {
      setAddressSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    try {
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
          searchText
        )}.json?access_token=${MAPBOX_TOKEN}&country=us&limit=5`
      );

      if (!response.ok) {
        console.error("Mapbox geocoding error");
        return;
      }

      const data = await response.json();
      interface MapboxFeature {
        center: [number, number];
        place_name: string;
      }
      const suggestions: GeocodeResult[] = data.features.map((feature: MapboxFeature) => ({
        lat: feature.center[1],
        lng: feature.center[0],
        displayName: feature.place_name,
      }));

      setAddressSuggestions(suggestions);
      setShowSuggestions(true);
    } catch (error) {
      console.error("Error fetching geocode suggestions:", error);
    }
  };

  // Select a suggestion and set it as the geocoded location
  const handleSelectSuggestion = (suggestion: GeocodeResult) => {
    setAddress(suggestion.displayName);
    setGeocodedLocation(suggestion);
    setConfirmedLat(suggestion.lat);
    setConfirmedLng(suggestion.lng);
    setAddressSuggestions([]);
    setShowSuggestions(false);
  };

  // Handle map coordinate change (user drags pin)
  const handleCoordinateChange = (lat: number, lng: number) => {
    setConfirmedLat(lat);
    setConfirmedLng(lng);
  };

  // Close suggestions on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();

    if (!confirmedLat || !confirmedLng) {
      alert("Please geocode an address and place the marker on the map");
      return;
    }

    const request: ScoreRequest = {
      address: geocodedLocation?.displayName || address,
      carrier: carrier.trim() || undefined,
      offeredRate: offeredRate ? parseFloat(offeredRate) : undefined,
      buyoutAmount: buyoutAmount ? parseFloat(buyoutAmount) : undefined,
      lat: confirmedLat,
      lng: confirmedLng,
    };

    onSubmit(request);
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl mx-auto space-y-3">
      <div>
        <label
          htmlFor="address"
          className="block text-xs font-medium text-gray-700 mb-1"
        >
          Address *
        </label>
        <div className="relative">
          <input
            id="address"
            type="text"
            placeholder="123 Main St, Phoenix AZ"
            value={address}
            onChange={(e) => handleAddressSearch(e.target.value)}
            disabled={isLoading}
            autoComplete="off"
            className="w-full px-3 py-2 border border-gray-300 rounded text-sm font-mono focus:outline-none focus:ring-1 focus:ring-black disabled:bg-gray-50"
          />
          {showSuggestions && addressSuggestions.length > 0 && (
            <div
              ref={suggestionsRef}
              className="absolute top-full left-0 right-0 bg-white border border-gray-300 border-t-0 rounded-b shadow-lg z-10"
            >
              {addressSuggestions.map((suggestion, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSelectSuggestion(suggestion)}
                  className="w-full text-left px-3 py-2 text-sm font-mono text-gray-700 hover:bg-gray-100 border-b border-gray-200 last:border-b-0"
                >
                  {suggestion.displayName}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Map component - show after geocoding */}
      {geocodedLocation && confirmedLat && confirmedLng && (
        <div className="pt-4">
          <MapPin
            initialLat={confirmedLat}
            initialLng={confirmedLng}
            onCoordinateChange={handleCoordinateChange}
          />
        </div>
      )}

      <div>
        <label
          htmlFor="carrier"
          className="block text-xs font-medium text-gray-700 mb-1"
        >
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
        <label
          htmlFor="offeredRate"
          className="block text-xs font-medium text-gray-700 mb-1"
        >
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
        <label
          htmlFor="buyoutAmount"
          className="block text-xs font-medium text-gray-700 mb-1"
        >
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
        disabled={isLoading || !confirmedLat || !confirmedLng}
        className="w-full bg-black hover:shadow-md disabled:opacity-60 text-white text-sm font-medium py-2 transition"
        style={{ borderRadius: "4px" }}
      >
        {isLoading ? "Running valuation..." : "Run valuation"}
      </button>
    </form>
  );
}
