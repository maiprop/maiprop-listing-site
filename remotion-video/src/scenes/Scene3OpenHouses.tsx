import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { loadFont as loadJakarta } from "@remotion/google-fonts/PlusJakartaSans";
import { loadFont as loadDM } from "@remotion/google-fonts/DMSans";
import { C } from "../theme";

const jakarta = loadJakarta("normal", { weights: ["600", "700", "800"], subsets: ["latin"] });
const dm = loadDM("normal", { weights: ["400", "500"], subsets: ["latin"] });

const Slot: React.FC<{ time: string; spots: string; status: "open" | "filling" | "full"; delay: number }> = ({ time, spots, status, delay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 18 } });
  const color = status === "open" ? C.cyan : status === "filling" ? "#f5a623" : C.slate;
  const label = status === "open" ? "Available" : status === "filling" ? "Filling fast" : "Full";
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "18px 22px", borderRadius: 14,
      background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`,
      opacity: s, transform: `translateX(${interpolate(s, [0, 1], [-30, 0])}px)`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, boxShadow: `0 0 14px ${color}` }} />
        <div style={{ color: C.white, fontFamily: jakarta.fontFamily, fontSize: 22, fontWeight: 600 }}>{time}</div>
      </div>
      <div style={{ color: C.slate, fontFamily: dm.fontFamily, fontSize: 15 }}>{spots}</div>
      <div style={{
        padding: "6px 12px", borderRadius: 999, fontSize: 13,
        background: `${color}22`, color, fontFamily: dm.fontFamily, fontWeight: 500,
      }}>{label}</div>
    </div>
  );
};

export const Scene3OpenHouses: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const headS = spring({ frame, fps, config: { damping: 200 } });
  const cardS = spring({ frame: frame - 14, fps, config: { damping: 18 } });

  // Visitor counter
  const visitors = Math.floor(interpolate(frame, [40, 110], [0, 28], { extrapolateRight: "clamp" }));

  return (
    <AbsoluteFill style={{ padding: 100, fontFamily: jakarta.fontFamily }}>
      <div style={{ opacity: headS, transform: `translateY(${interpolate(headS, [0, 1], [20, 0])}px)` }}>
        <div style={{ color: "#4ade80", fontFamily: dm.fontFamily, fontSize: 16, letterSpacing: 4, textTransform: "uppercase", marginBottom: 18 }}>
          02 — Open Houses
        </div>
        <h2 style={{ margin: 0, color: C.white, fontSize: 96, fontWeight: 800, letterSpacing: -3, lineHeight: 1 }}>
          Walk in. <span style={{ color: "#4ade80" }}>Or tune in.</span>
        </h2>
        <div style={{ marginTop: 18, color: C.slate, fontFamily: dm.fontFamily, fontSize: 24, maxWidth: 900 }}>
          Curated visits in person or live on video — book a slot in seconds.
        </div>
      </div>

      {/* Two-column main panel */}
      <div style={{
        position: "absolute", left: 100, right: 100, top: 420, height: 580,
        display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 40,
        opacity: cardS, transform: `translateY(${interpolate(cardS, [0, 1], [40, 0])}px)`,
      }}>
        {/* Property preview */}
        <div style={{
          borderRadius: 28, padding: 36,
          background: `linear-gradient(135deg, ${C.navyMid}, ${C.navy})`,
          border: `1px solid ${C.border}`,
          boxShadow: "0 30px 100px rgba(0,0,0,0.5)",
          display: "flex", flexDirection: "column",
        }}>
          {/* Image area */}
          <div style={{
            height: 280, borderRadius: 18, overflow: "hidden",
            background: `linear-gradient(135deg, ${C.indigo}55, #4ade8055), radial-gradient(circle at 70% 40%, ${C.cyan}40, transparent 60%)`,
            position: "relative", marginBottom: 24,
          }}>
            {/* LIVE indicator */}
            <div style={{
              position: "absolute", top: 18, left: 18,
              display: "flex", alignItems: "center", gap: 8,
              padding: "8px 14px", borderRadius: 999,
              background: "rgba(0,0,0,0.55)", border: `1px solid ${C.border}`,
            }}>
              <div style={{
                width: 8, height: 8, borderRadius: "50%", background: "#ef4444",
                opacity: 0.5 + 0.5 * Math.sin(frame * 0.3),
                boxShadow: "0 0 10px #ef4444",
              }} />
              <span style={{ color: C.white, fontFamily: dm.fontFamily, fontSize: 13, letterSpacing: 2, fontWeight: 600 }}>LIVE TOUR</span>
            </div>
            {/* Visitor badge */}
            <div style={{
              position: "absolute", bottom: 18, right: 18,
              padding: "10px 16px", borderRadius: 12,
              background: "rgba(0,0,0,0.6)", border: `1px solid ${C.border}`,
              color: C.white, fontFamily: dm.fontFamily, fontSize: 16,
            }}>
              <span style={{ color: "#4ade80", fontWeight: 600 }}>● {visitors}</span> watching
            </div>
          </div>

          <div style={{ color: C.slate, fontFamily: dm.fontFamily, fontSize: 14, letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>
            Saturday · April 26
          </div>
          <div style={{ color: C.white, fontFamily: jakarta.fontFamily, fontSize: 36, fontWeight: 700, lineHeight: 1.15 }}>
            Penthouse, Voula
          </div>
          <div style={{ color: C.slate, fontFamily: dm.fontFamily, fontSize: 18, marginTop: 8 }}>
            120m² · Sea view · €580,000
          </div>
        </div>

        {/* Time slots */}
        <div style={{
          borderRadius: 28, padding: 36,
          background: "rgba(255,255,255,0.04)",
          border: `1px solid ${C.border}`,
          display: "flex", flexDirection: "column", gap: 14,
        }}>
          <div style={{ color: C.slate, fontFamily: dm.fontFamily, fontSize: 14, letterSpacing: 2, textTransform: "uppercase", marginBottom: 6 }}>
            Pick a slot
          </div>
          <Slot time="10:00 — 10:30" spots="In person · 4 left" status="open" delay={28} />
          <Slot time="11:00 — 11:30" spots="In person · 1 left" status="filling" delay={36} />
          <Slot time="12:00 — 12:30" spots="In person" status="full" delay={44} />
          <Slot time="14:00 — 14:30" spots="Video tour · open" status="open" delay={52} />
          <Slot time="15:30 — 16:00" spots="Video tour · open" status="open" delay={60} />

          <div style={{
            marginTop: "auto", padding: "16px 20px", borderRadius: 12,
            background: "#4ade80", color: C.navyDeep,
            fontFamily: jakarta.fontFamily, fontWeight: 700, fontSize: 20,
            textAlign: "center",
            boxShadow: "0 10px 30px #4ade8055",
          }}>
            Reserve my spot →
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
