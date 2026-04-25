import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { loadFont as loadJakarta } from "@remotion/google-fonts/PlusJakartaSans";
import { loadFont as loadDM } from "@remotion/google-fonts/DMSans";
import { C } from "../theme";

const jakarta = loadJakarta("normal", { weights: ["600", "700", "800"], subsets: ["latin"] });
const dm = loadDM("normal", { weights: ["400", "500"], subsets: ["latin"] });

const auctions = [
  {
    code: "Lot 042",
    title: "3-Bed Apartment · Glyfada",
    court: "Athens Court",
    date: "12 May",
    starting: 220000,
    sqm: 95,
    type: "Residential",
  },
  {
    code: "Lot 058",
    title: "Retail Space · Kolonaki",
    court: "Athens Court",
    date: "14 May",
    starting: 410000,
    sqm: 140,
    type: "Commercial",
  },
  {
    code: "Lot 071",
    title: "Detached House · Kifisia",
    court: "Athens Court",
    date: "19 May",
    starting: 685000,
    sqm: 240,
    type: "Residential",
  },
  {
    code: "Lot 084",
    title: "Plot of Land · Spata",
    court: "Athens Court",
    date: "21 May",
    starting: 155000,
    sqm: 1200,
    type: "Land",
  },
];

export const Scene3Auction: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const headS = spring({ frame, fps, config: { damping: 200 } });

  // Stat counters animate up
  const totalThisWeek = Math.floor(interpolate(frame, [20, 80], [0, 47], { extrapolateRight: "clamp" }));
  const totalListed = Math.floor(interpolate(frame, [20, 90], [0, 1284], { extrapolateRight: "clamp" }));
  const avgBid = Math.floor(interpolate(frame, [20, 90], [0, 312000], { extrapolateRight: "clamp" }));

  return (
    <AbsoluteFill style={{ padding: 100, fontFamily: jakarta.fontFamily }}>
      <div style={{
        opacity: headS, transform: `translateY(${interpolate(headS, [0, 1], [20, 0])}px)`,
      }}>
        <div style={{ color: C.purple, fontFamily: dm.fontFamily, fontSize: 16, letterSpacing: 4, textTransform: "uppercase", marginBottom: 18 }}>
          03 — Greek Auctions
        </div>
        <h2 style={{ margin: 0, color: C.white, fontSize: 96, fontWeight: 800, letterSpacing: -3, lineHeight: 1 }}>
          Court auctions, <span style={{ color: C.cyan }}>discovered.</span>
        </h2>
        <div style={{ color: C.slate, fontFamily: dm.fontFamily, fontSize: 22, marginTop: 16, maxWidth: 1100 }}>
          Browse every public auction in Greece — verified, filtered, and ready to research.
        </div>
      </div>

      {/* Stats row */}
      <div style={{
        position: "absolute", left: 100, top: 360, width: 1720,
        display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 24,
      }}>
        {[
          { label: "This week", value: totalThisWeek.toString(), suffix: "auctions" },
          { label: "Total listed", value: totalListed.toLocaleString(), suffix: "active lots" },
          { label: "Avg starting bid", value: `€${(avgBid / 1000).toFixed(0)}k`, suffix: "across Greece" },
        ].map((s, i) => {
          const grow = spring({ frame: frame - 18 - i * 6, fps, config: { damping: 18 } });
          return (
            <div key={i} style={{
              padding: "28px 32px", borderRadius: 20,
              background: `linear-gradient(135deg, ${C.navyMid}, ${C.navy})`,
              border: `1px solid ${C.border}`,
              opacity: grow, transform: `translateY(${interpolate(grow, [0, 1], [30, 0])}px)`,
            }}>
              <div style={{ color: C.slate, fontFamily: dm.fontFamily, fontSize: 13, letterSpacing: 2, textTransform: "uppercase", marginBottom: 10 }}>
                {s.label}
              </div>
              <div style={{ color: C.white, fontFamily: jakarta.fontFamily, fontSize: 56, fontWeight: 800, letterSpacing: -2, lineHeight: 1 }}>
                {s.value}
              </div>
              <div style={{ color: C.cyan, fontFamily: dm.fontFamily, fontSize: 14, marginTop: 8 }}>
                {s.suffix}
              </div>
            </div>
          );
        })}
      </div>

      {/* Listings grid */}
      <div style={{
        position: "absolute", left: 100, top: 600, width: 1720,
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24,
      }}>
        {auctions.map((a, i) => {
          const card = spring({ frame: frame - 40 - i * 8, fps, config: { damping: 18 } });
          return (
            <div key={i} style={{
              padding: "28px 32px", borderRadius: 18,
              background: "rgba(255,255,255,0.03)",
              border: `1px solid ${C.border}`,
              opacity: card,
              transform: `translateY(${interpolate(card, [0, 1], [40, 0])}px)`,
              display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 24,
            }}>
              <div>
                <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
                  <div style={{
                    padding: "5px 12px", borderRadius: 6,
                    background: `${C.purple}33`, color: C.white,
                    fontFamily: dm.fontFamily, fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase",
                  }}>{a.code}</div>
                  <div style={{
                    padding: "5px 12px", borderRadius: 6,
                    background: `${C.cyan}22`, color: C.cyan,
                    fontFamily: dm.fontFamily, fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase",
                  }}>{a.type}</div>
                </div>
                <div style={{ color: C.white, fontFamily: jakarta.fontFamily, fontSize: 28, fontWeight: 700, lineHeight: 1.15, marginBottom: 8 }}>
                  {a.title}
                </div>
                <div style={{ color: C.slate, fontFamily: dm.fontFamily, fontSize: 15 }}>
                  {a.court} · {a.sqm} m² · Hearing {a.date}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ color: C.slate, fontFamily: dm.fontFamily, fontSize: 11, letterSpacing: 2, textTransform: "uppercase", marginBottom: 6 }}>
                  Starting bid
                </div>
                <div style={{ color: C.cyan, fontFamily: jakarta.fontFamily, fontSize: 32, fontWeight: 800, letterSpacing: -1 }}>
                  €{a.starting.toLocaleString()}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
