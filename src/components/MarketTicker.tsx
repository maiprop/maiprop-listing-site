import { useEffect, useRef } from "react";
import { TrendingUp, TrendingDown, Gavel } from "lucide-react";

const marketData = [
  { city: "Athens", price: 2826, change: 1.2, up: true },
  { city: "Thessaloniki", price: 1920, change: 0.8, up: true },
  { city: "Mykonos", price: 6450, change: 2.3, up: true },
  { city: "Glyfada", price: 3760, change: 1.7, up: true },
  { city: "Rhodes", price: 2290, change: 3.1, up: true },
  { city: "Santorini", price: 5128, change: 1.9, up: true },
  { city: "Kifisia", price: 4174, change: 0.8, up: true },
  { city: "Piraeus", price: 1680, change: -0.3, up: false },
  { city: "Heraklion", price: 1740, change: 1.4, up: true },
  { city: "Voula", price: 3920, change: 2.1, up: true },
  { city: "Paros", price: 4800, change: -0.5, up: false },
  { city: "Corfu", price: 2650, change: 1.8, up: true },
];

export function MarketTicker() {
  const doubled = [...marketData, ...marketData];

  return (
    <div className="bg-secondary border-b border-border overflow-hidden py-2">
      <div className="flex items-center gap-4">
        {/* Label */}
        <div className="shrink-0 flex items-center gap-2 pl-4 pr-3 border-r border-border">
          <div className="status-live text-xs font-semibold text-primary">LIVE MARKET</div>
        </div>
        {/* Auction count */}
        <div className="shrink-0 flex items-center gap-1.5 pr-3 border-r border-border">
          <Gavel className="w-3 h-3 text-brand-gold" />
          <span className="text-xs text-brand-gold font-semibold">47 New Auctions</span>
        </div>
        {/* Scrolling ticker */}
        <div className="ticker-wrapper flex-1">
          <div className="ticker-track gap-8">
            {doubled.map((item, idx) => (
              <div key={idx} className="shrink-0 flex items-center gap-2 px-3">
                <span className="text-xs font-medium text-foreground">{item.city}</span>
                <span className="text-xs font-bold text-foreground">
                  €{item.price.toLocaleString()}
                </span>
                <span className={`flex items-center gap-0.5 text-xs font-medium ${item.up ? "text-brand-emerald" : "text-destructive"}`}>
                  {item.up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {item.change > 0 ? "+" : ""}{item.change}%
                </span>
              </div>
            ))}
          </div>
        </div>
        {/* Unit */}
        <div className="shrink-0 pr-4 text-xs text-muted-foreground">€/m²</div>
      </div>
    </div>
  );
}
