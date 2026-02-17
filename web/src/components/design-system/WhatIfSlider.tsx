'use client';

import { useState, useMemo, useCallback } from 'react';

export interface TierConfig {
  min: number;
  max: number;
  rate: number;
  label: string;
}

interface WhatIfSliderProps {
  currentValue: number;
  currentPayout: number;
  tiers: TierConfig[];
  currency?: string;
  onChange?: (projectedValue: number, projectedPayout: number) => void;
}

function calculatePayout(value: number, tiers: TierConfig[]): number {
  let payout = 0;
  for (const tier of tiers) {
    if (value <= tier.min) continue;
    const applicable = Math.min(value, tier.max) - tier.min;
    if (applicable > 0) {
      payout += applicable * tier.rate;
    }
  }
  return payout;
}

export function WhatIfSlider({
  currentValue,
  currentPayout,
  tiers,
  currency = '$',
  onChange,
}: WhatIfSliderProps) {
  const maxSlider = currentValue * 2 || 100;
  const [sliderValue, setSliderValue] = useState(currentValue);

  const projectedPayout = useMemo(() => {
    return tiers.length > 0 ? calculatePayout(sliderValue, tiers) : (sliderValue / (currentValue || 1)) * currentPayout;
  }, [sliderValue, tiers, currentValue, currentPayout]);

  const delta = projectedPayout - currentPayout;
  const deltaPercent = currentPayout > 0 ? ((delta / currentPayout) * 100).toFixed(1) : '0.0';

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setSliderValue(val);
    onChange?.(val, calculatePayout(val, tiers));
  }, [onChange, tiers]);

  // Tier markers on the track
  const tierMarkers = tiers.map(t => ({
    position: Math.min((t.min / maxSlider) * 100, 100),
    label: t.label,
  })).filter(m => m.position > 0 && m.position < 100);

  const fillPercent = (sliderValue / maxSlider) * 100;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-400">Simulacion de logro</span>
        <span className="text-sm font-medium text-zinc-200 tabular-nums">
          {sliderValue.toLocaleString()} / {maxSlider.toLocaleString()}
        </span>
      </div>

      {/* Slider track */}
      <div className="relative">
        <div className="relative h-2 bg-zinc-800 rounded-full">
          <div
            className="absolute h-full bg-gradient-to-r from-emerald-500 to-lime-400 rounded-full"
            style={{ width: `${fillPercent}%` }}
          />
          {/* Tier markers */}
          {tierMarkers.map((m, i) => (
            <div
              key={i}
              className="absolute top-0 h-2 w-px bg-zinc-500"
              style={{ left: `${m.position}%` }}
              title={m.label}
            />
          ))}
          {/* Current value marker */}
          <div
            className="absolute top-0 h-2 w-0.5 bg-zinc-300"
            style={{ left: `${Math.min((currentValue / maxSlider) * 100, 100)}%` }}
            title="Valor actual"
          />
        </div>
        <input
          type="range"
          min={0}
          max={maxSlider}
          step={maxSlider / 200}
          value={sliderValue}
          onChange={handleChange}
          className="absolute inset-0 w-full h-2 opacity-0 cursor-pointer"
          aria-label="Simulacion de logro"
        />
      </div>

      {/* Projected payout */}
      <div className="flex items-baseline justify-between">
        <div>
          <p className="text-[11px] text-zinc-500">Pago proyectado</p>
          <p className="text-lg font-bold text-zinc-100 tabular-nums">
            {currency}{projectedPayout.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11px] text-zinc-500">Delta vs actual</p>
          <p className={`text-sm font-medium tabular-nums ${delta >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {delta >= 0 ? '+' : ''}{currency}{delta.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            <span className="text-zinc-500 ml-1">({delta >= 0 ? '+' : ''}{deltaPercent}%)</span>
          </p>
        </div>
      </div>
    </div>
  );
}
