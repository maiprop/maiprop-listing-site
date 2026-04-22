import { AbsoluteFill, useCurrentFrame } from "remotion";
import { C } from "../theme";

export const Background: React.FC = () => {
  const frame = useCurrentFrame();
  const t = frame * 0.4;
  return (
    <AbsoluteFill style={{ background: C.navyDeep, overflow: "hidden" }}>
      {/* base radial */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(1200px 900px at ${30 + Math.sin(t / 60) * 8}% ${40 + Math.cos(t / 80) * 6}%, ${C.indigo}40, transparent 60%), radial-gradient(900px 700px at ${75 + Math.cos(t / 50) * 6}% ${70 + Math.sin(t / 70) * 6}%, ${C.purple}33, transparent 65%), ${C.navyDeep}`,
        }}
      />
      {/* grid */}
      <AbsoluteFill
        style={{
          backgroundImage: `linear-gradient(${C.border} 1px, transparent 1px), linear-gradient(90deg, ${C.border} 1px, transparent 1px)`,
          backgroundSize: "80px 80px",
          opacity: 0.35,
          maskImage:
            "radial-gradient(ellipse at center, black 30%, transparent 75%)",
        }}
      />
      {/* vignette */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.55) 100%)",
        }}
      />
    </AbsoluteFill>
  );
};
