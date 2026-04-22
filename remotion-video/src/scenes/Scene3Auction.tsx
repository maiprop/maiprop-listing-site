import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { loadFont as loadJakarta } from "@remotion/google-fonts/PlusJakartaSans";
import { loadFont as loadDM } from "@remotion/google-fonts/DMSans";
import { C } from "../theme";

const jakarta = loadJakarta("normal", { weights: ["600", "700", "800"], subsets: ["latin"] });
const dm = loadDM("normal", { weights: ["400", "500"], subsets: ["latin"] });

export const Scene3Auction: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const headS = spring({ frame, fps, config: { damping: 200 } });
  const panel = spring({ frame: frame - 12, fps, config: { damping: 18 } });

  // Bid counter ticks
  const bidStart = 220000;
  const bidEnd = 287500;
  const bid = Math.floor(interpolate(frame, [30, 110], [bidStart, bidEnd], { extrapolateRight: "clamp" }));
  const bids = Math.floor(interpolate(frame, [30, 110], [3, 17], { extrapolateRight: "clamp" }));
  // Countdown
  const totalSec = 3 * 3600 + 42 * 60 + 18;
  const sec = totalSec - Math.floor((frame - 20) / fps);
  const hh = Math.max(0, Math.floor(sec / 3600));
  const mm = Math.max(0, Math.floor((sec % 3600) / 60));
  const ss = Math.max(0, sec % 60);

  // chart bars
  const bars = [12, 20, 16, 32, 28, 44, 38, 56, 48, 70, 60, 82];

  return (
    <AbsoluteFill style={{ padding: 100, fontFamily: jakarta.fontFamily }}>
      <div style={{
        opacity: headS, transform: `translateY(${interpolate(headS, [0, 1], [20, 0])}px)`,
      }}>
        <div style={{ color: C.purple, fontFamily: dm.fontFamily, fontSize: 16, letterSpacing: 4, textTransform: "uppercase", marginBottom: 18 }}>
          02 — Auctions
        </div>
        <h2 style={{ margin: 0, color: C.white, fontSize: 96, fontWeight: 800, letterSpacing: -3, lineHeight: 1 }}>
          Bid live. <span style={{ color: C.cyan }}>Win smart.</span>
        </h2>
      </div>

      {/* main panel */}
      <div style={{
        position: "absolute", left: 100, top: 380, width: 1720, height: 580,
        borderRadius: 28, padding: 50,
        background: `linear-gradient(135deg, ${C.navyMid}, ${C.navy})`,
        border: `1px solid ${C.border}`,
        opacity: panel, transform: `translateY(${interpolate(panel, [0, 1], [40, 0])}px)`,
        display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr", gap: 50,
        boxShadow: "0 30px 100px rgba(0,0,0,0.5)",
      }}>
        {/* Property */}
        <div>
          <div style={{ color: C.slate, fontFamily: dm.fontFamily, fontSize: 14, letterSpacing: 2, textTransform: "uppercase", marginBottom: 16 }}>Lot 042 · Athens</div>
          <div style={{ color: C.white, fontFamily: jakarta.fontFamily, fontSize: 44, fontWeight: 700, lineHeight: 1.1, marginBottom: 24 }}>
            3-Bedroom Apartment, Glyfada
          </div>
          <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
            <div style={{ padding: "8px 14px", borderRadius: 8, background: `${C.cyan}22`, color: C.cyan, fontFamily: dm.fontFamily, fontSize: 14 }}>Verified</div>
            <div style={{ padding: "8px 14px", borderRadius: 8, background: `${C.purple}33`, color: C.white, fontFamily: dm.fontFamily, fontSize: 14 }}>Court · Athens</div>
          </div>
          {/* mini bar chart */}
          <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 90, marginTop: 10 }}>
            {bars.map((h, i) => {
              const grow = spring({ frame: frame - 35 - i * 3, fps, config: { damping: 15 } });
              return (
                <div key={i} style={{
                  width: 18, height: `${h * grow}%`, borderRadius: 4,
                  background: i === bars.length - 1 ? C.cyan : `${C.purple}aa`,
                }} />
              );
            })}
          </div>
          <div style={{ color: C.slate, fontFamily: dm.fontFamily, fontSize: 13, marginTop: 10 }}>Bid history · last 60 min</div>
        </div>

        {/* Current Bid */}
        <div style={{ borderLeft: `1px solid ${C.border}`, paddingLeft: 50 }}>
          <div style={{ color: C.slate, fontFamily: dm.fontFamily, fontSize: 14, letterSpacing: 2, textTransform: "uppercase", marginBottom: 16 }}>Current bid</div>
          <div style={{ color: C.white, fontFamily: jakarta.fontFamily, fontSize: 84, fontWeight: 800, letterSpacing: -2, lineHeight: 1 }}>
            €{bid.toLocaleString()}
          </div>
          <div style={{ color: C.cyan, fontFamily: dm.fontFamily, fontSize: 18, marginTop: 12 }}>
            ▲ {bids} bids · +€{(bid - bidStart).toLocaleString()}
          </div>
          <div style={{
            marginTop: 36, padding: "16px 20px",
            borderRadius: 12,
            background: C.cyan, color: C.navyDeep,
            fontFamily: jakarta.fontFamily, fontWeight: 700, fontSize: 22,
            display: "inline-block",
            boxShadow: `0 10px 30px ${C.cyan}55`,
          }}>
            Place Bid →
          </div>
        </div>

        {/* Countdown */}
        <div style={{ borderLeft: `1px solid ${C.border}`, paddingLeft: 50 }}>
          <div style={{ color: C.slate, fontFamily: dm.fontFamily, fontSize: 14, letterSpacing: 2, textTransform: "uppercase", marginBottom: 16 }}>Closes in</div>
          <div style={{ display: "flex", gap: 14 }}>
            {[
              { v: hh, l: "hrs" },
              { v: mm, l: "min" },
              { v: ss, l: "sec" },
            ].map((t, i) => (
              <div key={i} style={{
                flex: 1, padding: "20px 6px", borderRadius: 14,
                background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`,
                textAlign: "center",
              }}>
                <div style={{ color: C.white, fontFamily: jakarta.fontFamily, fontSize: 48, fontWeight: 800, letterSpacing: -1 }}>
                  {String(t.v).padStart(2, "0")}
                </div>
                <div style={{ color: C.slate, fontFamily: dm.fontFamily, fontSize: 13, textTransform: "uppercase", letterSpacing: 2, marginTop: 4 }}>{t.l}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 28, color: C.slate, fontFamily: dm.fontFamily, fontSize: 16, lineHeight: 1.5 }}>
            Court verified · Title clear<br />Deposit refundable
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
