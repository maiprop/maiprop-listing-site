import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { loadFont as loadJakarta } from "@remotion/google-fonts/PlusJakartaSans";
import { loadFont as loadDM } from "@remotion/google-fonts/DMSans";
import { C } from "../theme";

const jakarta = loadJakarta("normal", { weights: ["600", "700", "800"], subsets: ["latin"] });
const dm = loadDM("normal", { weights: ["400", "500"], subsets: ["latin"] });

const Pro: React.FC<{ name: string; role: string; rating: string; x: number; y: number; delay: number; accent: string }> = ({ name, role, rating, x, y, delay, accent }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 16 } });
  return (
    <div style={{
      position: "absolute", left: x, top: y, width: 380,
      padding: 28, borderRadius: 22,
      background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`,
      opacity: s, transform: `translateY(${interpolate(s, [0, 1], [40, 0])}px) scale(${interpolate(s, [0, 1], [0.95, 1])})`,
      boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{
          width: 60, height: 60, borderRadius: "50%",
          background: `linear-gradient(135deg, ${accent}, ${C.purple})`,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: C.white, fontFamily: jakarta.fontFamily, fontSize: 24, fontWeight: 700,
        }}>{name.charAt(0)}</div>
        <div>
          <div style={{ color: C.white, fontFamily: jakarta.fontFamily, fontSize: 22, fontWeight: 700 }}>{name}</div>
          <div style={{ color: C.slate, fontFamily: dm.fontFamily, fontSize: 15, marginTop: 2 }}>{role}</div>
        </div>
      </div>
      <div style={{ marginTop: 18, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ color: C.cyan, fontFamily: dm.fontFamily, fontSize: 16 }}>★ {rating}</div>
        <div style={{
          padding: "8px 14px", borderRadius: 8,
          background: `${C.cyan}22`, color: C.cyan,
          fontFamily: dm.fontFamily, fontSize: 13, fontWeight: 500,
        }}>Available</div>
      </div>
    </div>
  );
};

export const Scene4Pros: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const headS = spring({ frame, fps, config: { damping: 200 } });

  return (
    <AbsoluteFill style={{ padding: 100, fontFamily: jakarta.fontFamily }}>
      <div style={{ opacity: headS, transform: `translateY(${interpolate(headS, [0, 1], [20, 0])}px)` }}>
        <div style={{ color: C.cyan, fontFamily: dm.fontFamily, fontSize: 16, letterSpacing: 4, textTransform: "uppercase", marginBottom: 18 }}>
          03 — Professionals
        </div>
        <h2 style={{ margin: 0, color: C.white, fontSize: 96, fontWeight: 800, letterSpacing: -3, lineHeight: 1 }}>
          Every expert. <span style={{ color: C.purple }}>One platform.</span>
        </h2>
        <div style={{ marginTop: 24, color: C.slate, fontFamily: dm.fontFamily, fontSize: 24, maxWidth: 900 }}>
          Lawyers, engineers, notaries, agents — book a video call in seconds.
        </div>
      </div>

      <Pro name="Eleni" role="Real Estate Lawyer" rating="4.9" x={100} y={520} delay={20} accent={C.cyan} />
      <Pro name="Nikos" role="Civil Engineer" rating="4.8" x={520} y={500} delay={28} accent={C.purple} />
      <Pro name="Maria" role="Notary, Athens" rating="5.0" x={940} y={520} delay={36} accent={C.indigo} />
      <Pro name="Yannis" role="Property Manager" rating="4.7" x={1360} y={500} delay={44} accent={C.cyan} />

      {/* connector */}
      <div style={{
        position: "absolute", left: 100, top: 880, right: 100, height: 2,
        background: `linear-gradient(90deg, transparent, ${C.cyan}, ${C.purple}, transparent)`,
        opacity: interpolate(frame, [50, 80], [0, 1], { extrapolateRight: "clamp" }),
      }} />
      <div style={{
        position: "absolute", left: 100, right: 100, top: 900, textAlign: "center",
        color: C.slate, fontFamily: dm.fontFamily, fontSize: 18, letterSpacing: 4, textTransform: "uppercase",
        opacity: interpolate(frame, [60, 85], [0, 1], { extrapolateRight: "clamp" }),
      }}>
        Verified · Insured · Reviewed
      </div>
    </AbsoluteFill>
  );
};
