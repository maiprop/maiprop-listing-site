import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { loadFont as loadJakarta } from "@remotion/google-fonts/PlusJakartaSans";
import { loadFont as loadDM } from "@remotion/google-fonts/DMSans";
import { C } from "../theme";

const jakarta = loadJakarta("normal", { weights: ["600", "700", "800"], subsets: ["latin"] });
const dm = loadDM("normal", { weights: ["400", "500"], subsets: ["latin"] });

const SparkIcon: React.FC<{ size?: number; color?: string }> = ({ size = 22, color = C.cyan }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path d="M12 2 L13.8 9.2 L21 11 L13.8 12.8 L12 20 L10.2 12.8 L3 11 L10.2 9.2 Z" fill={color} />
    <circle cx="19" cy="5" r="1.5" fill={color} opacity="0.7" />
    <circle cx="5" cy="19" r="1.2" fill={color} opacity="0.5" />
  </svg>
);

const FeatureCard: React.FC<{
  x: number; y: number; w: number;
  icon: string; title: string; sub: string;
  accent: string; delay: number;
}> = ({ x, y, w, icon, title, sub, accent, delay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 18, stiffness: 130 } });
  return (
    <div style={{
      position: "absolute", left: x, top: y, width: w, padding: 28,
      borderRadius: 22,
      background: "linear-gradient(160deg, rgba(255,255,255,0.07), rgba(255,255,255,0.02))",
      border: `1px solid ${C.border}`,
      transform: `translateY(${interpolate(s, [0, 1], [40, 0])}px)`,
      opacity: s,
      boxShadow: `0 20px 60px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)`,
    }}>
      <div style={{
        width: 52, height: 52, borderRadius: 14,
        background: `linear-gradient(135deg, ${accent}, ${accent}99)`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 26, marginBottom: 18,
        boxShadow: `0 10px 24px ${accent}55`,
      }}>{icon}</div>
      <div style={{ color: C.white, fontFamily: jakarta.fontFamily, fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
        {title}
      </div>
      <div style={{ color: C.slate, fontFamily: dm.fontFamily, fontSize: 15, lineHeight: 1.5 }}>
        {sub}
      </div>
    </div>
  );
};

export const Scene6AI: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const headerS = spring({ frame, fps, config: { damping: 200 } });

  // AI prompt typing
  const prompt = "Quiet 2-bed near metro under €350k";
  const charCount = Math.floor(interpolate(frame, [20, 60], [0, prompt.length], { extrapolateRight: "clamp" }));

  // Valuation counter
  const valuation = Math.floor(interpolate(frame, [80, 140], [0, 348500], { extrapolateRight: "clamp" }));

  // Confidence bar
  const confidence = interpolate(frame, [90, 150], [0, 0.92], { extrapolateRight: "clamp" });

  // Pulsing glow
  const pulse = Math.sin(frame / 8) * 0.5 + 0.5;

  return (
    <AbsoluteFill style={{ padding: 100, fontFamily: jakarta.fontFamily }}>
      {/* Header */}
      <div style={{
        opacity: headerS,
        transform: `translateY(${interpolate(headerS, [0, 1], [20, 0])}px)`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
          <SparkIcon size={20} color={C.cyan} />
          <div style={{ color: C.cyan, fontFamily: dm.fontFamily, fontSize: 16, letterSpacing: 4, textTransform: "uppercase" }}>
            05 — AI Intelligence
          </div>
        </div>
        <h2 style={{ margin: 0, color: C.white, fontSize: 92, fontWeight: 800, letterSpacing: -3, lineHeight: 1 }}>
          AI that <span style={{
            background: `linear-gradient(135deg, ${C.cyan}, ${C.purple})`,
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}>understands</span> the market.
        </h2>
        <div style={{ marginTop: 18, color: C.slate, fontFamily: dm.fontFamily, fontSize: 24, maxWidth: 1100 }}>
          Natural-language search, instant valuations, and a smart assistant — built in.
        </div>
      </div>

      {/* AI prompt bar (hero element) */}
      <div style={{
        marginTop: 44,
        display: "flex", alignItems: "center", gap: 18,
        background: `linear-gradient(135deg, rgba(78,245,241,0.08), rgba(135,85,242,0.08))`,
        border: `1.5px solid ${C.cyan}55`,
        borderRadius: 22, padding: "22px 28px",
        maxWidth: 1100,
        opacity: spring({ frame: frame - 12, fps, config: { damping: 20 } }),
        boxShadow: `0 0 ${40 + pulse * 30}px rgba(78,245,241,${0.15 + pulse * 0.15})`,
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: 12,
          background: `linear-gradient(135deg, ${C.cyan}, ${C.purple})`,
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: `0 8px 20px ${C.cyan}55`,
        }}>
          <SparkIcon size={22} color={C.navy} />
        </div>
        <span style={{ color: C.white, fontFamily: dm.fontFamily, fontSize: 26, fontWeight: 400 }}>
          {prompt.slice(0, charCount)}
          {frame % 30 < 15 && charCount < prompt.length && <span style={{ color: C.cyan }}>|</span>}
        </span>
        {charCount >= prompt.length && (
          <div style={{
            marginLeft: "auto",
            padding: "8px 16px", borderRadius: 999,
            background: C.purple, color: C.white,
            fontFamily: dm.fontFamily, fontSize: 14, fontWeight: 600,
            opacity: spring({ frame: frame - 60, fps, config: { damping: 20 } }),
          }}>
            24 matches found
          </div>
        )}
      </div>

      {/* Three feature cards */}
      <div style={{ position: "absolute", left: 100, right: 100, top: 720, height: 240 }}>
        <FeatureCard
          x={0} y={0} w={420}
          icon="🔍" title="Conversational Search"
          sub="Describe what you want in plain language — the AI translates it into precise filters."
          accent={C.cyan} delay={70}
        />

        {/* Valuation card with live counter */}
        <div style={{
          position: "absolute", left: 460, top: 0, width: 420, padding: 28,
          borderRadius: 22,
          background: "linear-gradient(160deg, rgba(135,85,242,0.12), rgba(255,255,255,0.02))",
          border: `1px solid ${C.purple}55`,
          transform: `translateY(${interpolate(spring({ frame: frame - 76, fps, config: { damping: 18 } }), [0, 1], [40, 0])}px)`,
          opacity: spring({ frame: frame - 76, fps, config: { damping: 18 } }),
          boxShadow: `0 20px 60px rgba(0,0,0,0.4)`,
        }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14,
            background: `linear-gradient(135deg, ${C.purple}, ${C.indigo})`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 26, marginBottom: 18,
            boxShadow: `0 10px 24px ${C.purple}55`,
          }}>📊</div>
          <div style={{ color: C.white, fontFamily: jakarta.fontFamily, fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
            AI Valuation
          </div>
          <div style={{ color: C.cyan, fontFamily: jakarta.fontFamily, fontSize: 32, fontWeight: 800, marginBottom: 10 }}>
            €{valuation.toLocaleString()}
          </div>
          <div style={{ height: 6, background: "rgba(255,255,255,0.08)", borderRadius: 999, overflow: "hidden" }}>
            <div style={{
              height: "100%", width: `${confidence * 100}%`,
              background: `linear-gradient(90deg, ${C.cyan}, ${C.purple})`,
              borderRadius: 999,
            }} />
          </div>
          <div style={{ color: C.slate, fontFamily: dm.fontFamily, fontSize: 13, marginTop: 8 }}>
            {Math.round(confidence * 100)}% confidence · 142 comparables
          </div>
        </div>

        <FeatureCard
          x={920} y={0} w={420}
          icon="💬" title="AI Assistant"
          sub="Ask anything about a listing, neighborhood, or the Greek market — get instant answers."
          accent={C.indigo} delay={82}
        />
      </div>
    </AbsoluteFill>
  );
};
