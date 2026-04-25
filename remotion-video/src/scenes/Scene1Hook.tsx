import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { loadFont as loadJakarta } from "@remotion/google-fonts/PlusJakartaSans";
import { loadFont as loadDM } from "@remotion/google-fonts/DMSans";
import { C } from "../theme";

const jakarta = loadJakarta("normal", { weights: ["400", "600", "700", "800"], subsets: ["latin"] });
const dm = loadDM("normal", { weights: ["400", "500"], subsets: ["latin"] });

export const Scene1Hook: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const m1 = spring({ frame: frame - 4, fps, config: { damping: 200 } });
  const m2 = spring({ frame: frame - 18, fps, config: { damping: 200 } });
  const dot = spring({ frame: frame - 30, fps, config: { damping: 12 } });
  const sub = interpolate(frame, [40, 60], [0, 1], { extrapolateRight: "clamp" });
  const lineW = interpolate(frame, [50, 80], [0, 100], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ alignItems: "flex-start", justifyContent: "center", padding: "0 140px", fontFamily: jakarta.fontFamily }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 14,
        opacity: interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" }),
        transform: `translateY(${interpolate(spring({ frame, fps, config: { damping: 200 } }), [0, 1], [10, 0])}px)`,
        marginBottom: 36,
      }}>
        <div style={{ width: 10, height: 10, background: C.cyan, transform: `scale(${dot})`, boxShadow: `0 0 20px ${C.cyan}` }} />
        <span style={{ color: C.slate, fontFamily: dm.fontFamily, fontSize: 18, letterSpacing: 4, textTransform: "uppercase", fontWeight: 500 }}>
          Real estate, reimagined
        </span>
      </div>

      <h1 style={{
        margin: 0, color: C.white, fontWeight: 800, fontSize: 200, lineHeight: 0.95,
        letterSpacing: -6, fontFamily: jakarta.fontFamily,
      }}>
        <span style={{
          display: "block",
          opacity: m1,
          transform: `translateY(${interpolate(m1, [0, 1], [60, 0])}px)`,
          clipPath: `inset(0 ${interpolate(m1, [0, 1], [100, 0])}% 0 0)`,
        }}>
          The future
        </span>
        <span style={{
          display: "block",
          opacity: m2,
          transform: `translateY(${interpolate(m2, [0, 1], [60, 0])}px)`,
          clipPath: `inset(0 ${interpolate(m2, [0, 1], [100, 0])}% 0 0)`,
        }}>
          of <span style={{ color: C.cyan }}>property</span>.
        </span>
      </h1>

      <div style={{ marginTop: 50, display: "flex", alignItems: "center", gap: 24, opacity: sub }}>
        <div style={{ height: 2, background: C.cyan, width: `${lineW}px` }} />
        <span style={{ color: C.off, fontFamily: dm.fontFamily, fontSize: 24, fontWeight: 400 }}>
          Search · Auction · Invest
        </span>
      </div>
    </AbsoluteFill>
  );
};
