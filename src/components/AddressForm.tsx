"use client";

import { useState, FormEvent } from "react";
import { ScoreRequest } from "@/lib/types";

interface AddressFormProps {
  onSubmit: (request: ScoreRequest) => void;
  isLoading: boolean;
}

export default function AddressForm({ onSubmit, isLoading }: AddressFormProps) {
  const [address, setAddress] = useState("");
  const [carrier, setCarrier] = useState("");
  const [offeredRate, setOfferedRate] = useState("");
  const [buyoutAmount, setBuyoutAmount] = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();

    if (!address.trim()) {
      alert("Please enter an address");
      return;
    }

    const request: ScoreRequest = {
      address: address.trim(),
      carrier: carrier.trim() || undefined,
      offeredRate: offeredRate ? parseFloat(offeredRate) : undefined,
      buyoutAmount: buyoutAmount ? parseFloat(buyoutAmount) : undefined,
    };

    onSubmit(request);
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl mx-auto space-y-4">
      <div>
        <label htmlFor="address" className="block text-sm font-medium text-gray-700">
          Address *
        </label>
        <input
          id="address"
          type="text"
          placeholder="123 Main St, Springfield, IL"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          disabled={isLoading}
          className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
        />
      </div>

      <div>
        <label htmlFor="carrier" className="block text-sm font-medium text-gray-700">
          Carrier / Tower Company (optional)
        </label>
        <input
          id="carrier"
          type="text"
          placeholder="e.g. Crown Castle, Verizon, AT&T"
          value={carrier}
          onChange={(e) => setCarrier(e.target.value)}
          disabled={isLoading}
          className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
        />
      </div>

      <div>
        <label htmlFor="offeredRate" className="block text-sm font-medium text-gray-700">
          Offered / Current Monthly Rate (optional)
        </label>
        <input
          id="offeredRate"
          type="number"
          placeholder="$800"
          value={offeredRate}
          onChange={(e) => setOfferedRate(e.target.value)}
          disabled={isLoading}
          min="0"
          className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
        />
      </div>

      <div>
        <label htmlFor="buyoutAmount" className="block text-sm font-medium text-gray-700">
          Buyout Offer (optional)
        </label>
        <input
          id="buyoutAmount"
          type="number"
          placeholder="$95,000"
          value={buyoutAmount}
          onChange={(e) => setBuyoutAmount(e.target.value)}
          disabled={isLoading}
          min="0"
          className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
        />
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-3 rounded-md transition"
      >
        {isLoading ? "Analyzing..." : "Analyze My Site"}
      </button>
    </form>
  );
}
