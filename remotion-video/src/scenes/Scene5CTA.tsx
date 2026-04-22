import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { loadFont as loadJakarta } from "@remotion/google-fonts/PlusJakartaSans";
import { loadFont as loadDM } from "@remotion/google-fonts/DMSans";
import { C } from "../theme";

const jakarta = loadJakarta("normal", { weights: ["600", "700", "800"], subsets: ["latin"] });
const dm = loadDM("normal", { weights: ["400", "500"], subsets: ["latin"] });

const Stat: React.FC<{ value: string; label: string; delay: number }> = ({ value, label, delay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 16 } });
  return (
    <div style={{
      opacity: s, transform: `translateY(${interpolate(s, [0, 1], [30, 0])}px)`,
      borderLeft: `2px solid ${C.cyan}`, paddingLeft: 24,
    }}>
      <div style={{ color: C.white, fontFamily: jakarta.fontFamily, fontSize: 72, fontWeight: 800, letterSpacing: -2, lineHeight: 1 }}>{value}</div>
      <div style={{ color: C.slate, fontFamily: dm.fontFamily, fontSize: 18, marginTop: 8, letterSpacing: 1 }}>{label}</div>
    </div>
  );
};

export const Scene5CTA: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoS = spring({ frame, fps, config: { damping: 200 } });
  const titleS = spring({ frame: frame - 8, fps, config: { damping: 200 } });
  const ctaS = spring({ frame: frame - 50, fps, config: { damping: 14 } });
  const urlS = interpolate(frame, [60, 80], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ padding: 100, fontFamily: jakarta.fontFamily, alignItems: "center", justifyContent: "center" }}>
      {/* Mark */}
      <div style={{
        display: "flex", alignItems: "center", gap: 16,
        opacity: logoS, transform: `translateY(${interpolate(logoS, [0, 1], [20, 0])}px)`,
        marginBottom: 40,
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: 14,
          background: `linear-gradient(135deg, ${C.cyan}, ${C.purple})`,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: C.navyDeep, fontFamily: jakarta.fontFamily, fontSize: 32, fontWeight: 800,
          boxShadow: `0 10px 40px ${C.purple}66`,
        }}>m</div>
        <span style={{ color: C.white, fontFamily: jakarta.fontFamily, fontSize: 36, fontWeight: 700, letterSpacing: -1 }}>maiprop</span>
      </div>

      <h1 style={{
        margin: 0, color: C.white, fontFamily: jakarta.fontFamily, fontSize: 168, fontWeight: 800,
        letterSpacing: -6, lineHeight: 0.95, textAlign: "center",
        opacity: titleS,
        transform: `translateY(${interpolate(titleS, [0, 1], [40, 0])}px)`,
      }}>
        Property,<br />
        <span style={{
          background: `linear-gradient(135deg, ${C.cyan}, ${C.purple})`,
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        }}>finally simple.</span>
      </h1>

      {/* Stats */}
      <div style={{ marginTop: 70, display: "flex", gap: 80 }}>
        <Stat value="12k+" label="LISTINGS" delay={20} />
        <Stat value="800+" label="PROFESSIONALS" delay={26} />
        <Stat value="60s" label="TO BOOK" delay={32} />
      </div>

      {/* CTA */}
      <div style={{
        marginTop: 70,
        padding: "26px 56px", borderRadius: 999,
        background: C.cyan, color: C.navyDeep,
        fontFamily: jakarta.fontFamily, fontSize: 32, fontWeight: 700,
        opacity: ctaS, transform: `scale(${interpolate(ctaS, [0, 1], [0.9, 1])})`,
        boxShadow: `0 20px 60px ${C.cyan}44`,
      }}>
        Get started — free
      </div>

      <div style={{
        marginTop: 28, color: C.slate, fontFamily: dm.fontFamily, fontSize: 22, letterSpacing: 6,
        opacity: urlS, textTransform: "uppercase",
      }}>
        maiprop.co
      </div>
    </AbsoluteFill>
  );
};
