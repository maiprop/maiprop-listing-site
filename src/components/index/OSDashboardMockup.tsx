/** Static sample of the os.maiprop.co investment dashboard used in the homepage section. */
export function OSDashboardMockup() {
  const prices = [2860, 1920, 6450, 3772, 2290, 5120, 4180];

  const marketData = [
    { city: "Athens",       delta: "▲1.3%" },
    { city: "Thessaloniki", delta: "▲0.8%" },
    { city: "Mykonos",      delta: "▲2.3%" },
    { city: "Glyfada",      delta: "▲1.7%" },
    { city: "Rhodes",       delta: "▲3.1%" },
    { city: "Santorini",    delta: "▲1.9%" },
    { city: "Kifisia",      delta: "▲0.6%" },
  ];

  const sparklines = [
    "M0,10 C5,8 10,6 15,4 C20,2 25,5 30,2",
    "M0,8 C5,10 10,7 15,9 C20,5 25,3 30,4",
    "M0,10 C5,9 10,6 15,7 C20,4 25,2 30,1",
    "M0,9 C5,7 10,8 15,5 C20,6 25,4 30,3",
    "M0,10 C5,8 10,11 15,7 C20,5 25,6 30,3",
    "M0,9 C5,6 10,7 15,5 C20,8 25,4 30,2",
    "M0,10 C5,9 10,8 15,9 C20,7 25,8 30,9",
  ];

  return (
    <div className="w-full h-full overflow-hidden select-none font-sans" style={{ background: "hsl(220 30% 7%)" }}>
      {/* Navbar */}
      <div
        className="flex items-center justify-between px-4 py-2 border-b"
        style={{ borderColor: "rgba(255,255,255,0.08)", background: "hsl(220 30% 5%)" }}
      >
        <div className="flex items-center gap-3">
          <div className="text-[10px] font-black tracking-tight flex items-center gap-1" style={{ color: "hsl(183 100% 50%)" }}>
            mAI Prop
            <span className="text-[7px] font-black ml-0.5 px-1 rounded-sm" style={{ background: "hsl(183 100% 50% / 0.15)", color: "hsl(183 100% 70%)" }}>
              OS
            </span>
          </div>
          <div className="flex gap-1.5">
            {["Modules", "Benefits", "Pricing", "Resources"].map((t) => (
              <span key={t} className="text-[7px] px-1.5 py-0.5 rounded" style={{ color: "rgba(255,255,255,0.4)" }}>
                {t}
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-[7px] px-2 py-1 rounded-full font-bold" style={{ background: "hsl(183 100% 50% / 0.12)", color: "hsl(183 100% 70%)" }}>
            Demo · Sample data
          </div>
          <div className="text-[7px] px-2 py-1 rounded-full font-bold" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)" }}>
            START FOR FREE
          </div>
          <div className="text-[7px] px-2 py-1 rounded-full font-bold" style={{ background: "hsl(183 100% 50% / 0.15)", color: "hsl(183 100% 50%)", border: "1px solid hsl(183 100% 50% / 0.3)" }}>
            SIGN IN
          </div>
        </div>
      </div>

      {/* Hero + Market Widget */}
      <div className="flex h-[calc(100%-36px)]">
        {/* Left: Hero text */}
        <div className="flex-1 px-5 pt-5 pb-3 flex flex-col justify-center">
          <div className="text-[13px] font-black leading-snug mb-2" style={{ color: "rgba(255,255,255,0.9)" }}>
            Real Estate
            <br />
            <span style={{ color: "hsl(183 100% 50%)" }}>Investment Platform</span>
          </div>
          <p className="text-[7px] mb-2.5" style={{ color: "hsl(183 100% 70%)" }}>
            Gain The Edge In Greek Real Estate Market With:
          </p>
          <div className="space-y-1.5 mb-4">
            {[
              "Data Accessibility",
              "Predictive Analytics",
              "Mapped Data & Automated Reports",
              "Portfolio & Asset Management",
              "Auctions Analysis & Automations",
            ].map((f) => (
              <div key={f} className="flex items-center gap-1.5 text-[7px]" style={{ color: "rgba(255,255,255,0.7)" }}>
                <div className="w-2.5 h-2.5 rounded-full border flex items-center justify-center shrink-0" style={{ borderColor: "hsl(183 100% 50% / 0.5)" }}>
                  <div className="w-1 h-1 rounded-full" style={{ background: "hsl(183 100% 50%)" }} />
                </div>
                {f}
              </div>
            ))}
          </div>
          <div
            className="inline-flex items-center gap-1.5 text-[7px] font-bold px-3 py-1.5 rounded-full w-fit"
            style={{ background: "hsl(183 100% 50% / 0.12)", border: "1px solid hsl(183 100% 50% / 0.35)", color: "hsl(183 100% 60%)" }}
          >
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "hsl(183 100% 50%)" }} />
            SEE IT IN ACTION
          </div>
        </div>

        {/* Right: static sample market widget */}
        <div className="w-44 shrink-0 mr-4 mt-4 mb-4 rounded-xl overflow-hidden border flex flex-col" style={{ background: "hsl(220 30% 10%)", borderColor: "rgba(255,255,255,0.1)" }}>
          <div className="flex items-center justify-between px-2.5 py-1.5 border-b" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
            <div className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: "hsl(183 100% 50%)" }} />
              <span className="text-[7px] font-bold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.6)" }}>Sample market data</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: "hsl(183 100% 50%)" }} />
              <span className="text-[6px] font-bold" style={{ color: "hsl(183 100% 60%)" }}>DEMO</span>
            </div>
          </div>
          <div className="flex-1 overflow-hidden">
            {marketData.map((row, i) => {
              return (
                <div
                  key={row.city}
                  className="flex items-center gap-1 px-2.5 py-[3px] border-b last:border-0"
                  style={{ borderColor: "rgba(255,255,255,0.04)" }}
                >
                  <span className="text-[7px] w-16 truncate" style={{ color: "rgba(255,255,255,0.7)" }}>
                    {row.city}
                  </span>
                  <svg viewBox="0 0 30 12" className="w-7 h-2.5 shrink-0" preserveAspectRatio="none">
                    <path d={sparklines[i]} fill="none" stroke="hsl(183 100% 50%)" strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                  <span className="text-[7px] font-bold ml-auto" style={{ color: "rgba(255,255,255,0.9)" }}>
                    {prices[i].toLocaleString()}
                  </span>
                  <span className="text-[6px] font-bold w-8 text-right" style={{ color: "hsl(142 70% 55%)" }}>
                    {row.delta}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="mx-2 my-1.5 rounded-lg px-2 py-1.5 border" style={{ background: "hsl(183 100% 50% / 0.06)", borderColor: "hsl(183 100% 50% / 0.15)" }}>
            <div className="flex items-center justify-between mb-0.5">
              <div className="flex items-center gap-1">
                <span className="text-[8px]">⚡</span>
                <span className="text-[6px] font-bold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.4)" }}>Sample Auctions</span>
              </div>
              <span className="text-[11px] font-black" style={{ color: "hsl(183 100% 60%)" }}>47</span>
            </div>
            <div className="text-[6px]" style={{ color: "rgba(255,255,255,0.35)" }}>
              Example: <span style={{ color: "rgba(255,255,255,0.6)" }}>Apartment · Athens</span>
            </div>
            <div className="text-[7px] font-bold mt-0.5" style={{ color: "hsl(183 100% 50%)" }}>€128,000</div>
          </div>
          <div className="text-center pb-1.5">
            <span className="text-[5.5px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.2)" }}>€/m² · Greek Real Estate Index</span>
          </div>
        </div>
      </div>
    </div>
  );
}
