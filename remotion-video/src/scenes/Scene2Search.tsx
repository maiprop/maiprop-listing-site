import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { loadFont as loadJakarta } from "@remotion/google-fonts/PlusJakartaSans";
import { loadFont as loadDM } from "@remotion/google-fonts/DMSans";
import { C } from "../theme";

const jakarta = loadJakarta("normal", { weights: ["600", "700", "800"], subsets: ["latin"] });
const dm = loadDM("normal", { weights: ["400", "500"], subsets: ["latin"] });

const Pill: React.FC<{ label: string; active?: boolean; delay: number }> = ({ label, active, delay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 18 } });
  return (
    <div style={{
      padding: "12px 22px",
      borderRadius: 999,
      background: active ? C.purple : "rgba(255,255,255,0.06)",
      border: active ? "none" : `1px solid ${C.border}`,
      color: active ? C.white : C.slate,
      fontFamily: dm.fontFamily, fontSize: 18, fontWeight: 500,
      transform: `translateY(${interpolate(s, [0, 1], [20, 0])}px) scale(${interpolate(s, [0, 1], [0.9, 1])})`,
      opacity: s,
      boxShadow: active ? `0 8px 28px ${C.purple}55` : "none",
    }}>{label}</div>
  );
};

const Card: React.FC<{ x: number; y: number; w: number; h: number; price: string; loc: string; tag: string; tagColor: string; delay: number }> = ({ x, y, w, h, price, loc, tag, tagColor, delay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 18, stiffness: 120 } });
  const lift = interpolate(s, [0, 1], [40, 0]);
  return (
    <div style={{
      position: "absolute", left: x, top: y, width: w, height: h,
      borderRadius: 24, overflow: "hidden",
      background: "linear-gradient(160deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))",
      border: `1px solid ${C.border}`,
      transform: `translateY(${lift}px)`, opacity: s,
      boxShadow: "0 20px 60px rgba(0,0,0,0.45)",
    }}>
      <div style={{
        height: "60%",
        background: `linear-gradient(135deg, ${C.indigo}55, ${C.purple}66), radial-gradient(circle at 30% 30%, ${C.cyan}30, transparent 50%)`,
        position: "relative",
      }}>
        <div style={{
          position: "absolute", top: 16, left: 16,
          padding: "6px 12px", borderRadius: 999,
          background: tagColor, color: C.white,
          fontFamily: dm.fontFamily, fontSize: 13, fontWeight: 500,
        }}>{tag}</div>
      </div>
      <div style={{ padding: 22 }}>
        <div style={{ color: C.white, fontFamily: jakarta.fontFamily, fontSize: 28, fontWeight: 700 }}>{price}</div>
        <div style={{ color: C.slate, fontFamily: dm.fontFamily, fontSize: 16, marginTop: 6 }}>{loc}</div>
      </div>
    </div>
  );
};

export const Scene2Search: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const headerS = spring({ frame, fps, config: { damping: 200 } });
  const searchS = spring({ frame: frame - 6, fps, config: { damping: 18 } });
  const typed = "Athens · 2-bed · €350k";
  const charCount = Math.floor(interpolate(frame, [16, 50], [0, typed.length], { extrapolateRight: "clamp" }));

  return (
    <AbsoluteFill style={{ padding: 100, fontFamily: jakarta.fontFamily }}>
      <div style={{
        opacity: headerS,
        transform: `translateY(${interpolate(headerS, [0, 1], [20, 0])}px)`,
      }}>
        <div style={{ color: C.cyan, fontFamily: dm.fontFamily, fontSize: 16, letterSpacing: 4, textTransform: "uppercase", marginBottom: 18 }}>01 — Properties</div>
        <h2 style={{ margin: 0, color: C.white, fontSize: 96, fontWeight: 800, letterSpacing: -3, lineHeight: 1 }}>
          Thousands of homes.
        </h2>
        <div style={{ marginTop: 18, color: C.slate, fontFamily: dm.fontFamily, fontSize: 24, maxWidth: 900 }}>
          Verified listings across Greece — buy, rent, or invest.
        </div>
      </div>

      {/* search bar */}
      <div style={{
        marginTop: 40,
        display: "flex", alignItems: "center", gap: 16,
        background: "rgba(255,255,255,0.06)",
        border: `1px solid ${C.border}`,
        borderRadius: 20, padding: "20px 28px",
        opacity: searchS,
        transform: `scale(${interpolate(searchS, [0, 1], [0.95, 1])})`,
        maxWidth: 880,
      }}>
        <div style={{ width: 24, height: 24, borderRadius: "50%", border: `2.5px solid ${C.cyan}`, position: "relative" }}>
          <div style={{ position: "absolute", right: -7, bottom: -7, width: 12, height: 2.5, background: C.cyan, transform: "rotate(45deg)", transformOrigin: "left" }} />
        </div>
        <span style={{ color: C.white, fontFamily: dm.fontFamily, fontSize: 26, fontWeight: 400 }}>
          {typed.slice(0, charCount)}
          {frame % 30 < 15 && charCount < typed.length && <span style={{ color: C.cyan }}>|</span>}
        </span>
      </div>

      {/* filter pills */}
      <div style={{ marginTop: 24, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Pill label="For Sale" active delay={20} />
        <Pill label="Apartment" delay={24} />
        <Pill label="2+ Beds" delay={28} />
        <Pill label="€200-400k" delay={32} />
        <Pill label="Athens" delay={36} />
      </div>

      {/* result cards */}
      <div style={{ position: "absolute", left: 100, right: 100, top: 660, height: 360 }}>
        <Card x={0} y={0} w={360} h={340} price="€365,000" loc="Kolonaki, Athens" tag="Featured" tagColor={C.purple} delay={50} />
        <Card x={400} y={0} w={360} h={340} price="€289,000" loc="Glyfada · 95m²" tag="New" tagColor={C.indigo} delay={56} />
        <Card x={800} y={0} w={360} h={340} price="€420,000" loc="Kifisia · Villa" tag="Hot" tagColor="#ec4899" delay={62} />
        <Card x={1200} y={0} w={360} h={340} price="€310,000" loc="Pagrati · 2 bed" tag="Verified" tagColor={C.cyan} delay={68} />
      </div>
    </AbsoluteFill>
  );
};
