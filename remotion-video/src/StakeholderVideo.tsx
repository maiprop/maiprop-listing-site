import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { loadFont as loadDM } from "@remotion/google-fonts/DMSans";
import { loadFont as loadJakarta } from "@remotion/google-fonts/PlusJakartaSans";
import { C } from "./theme";
import type { StakeholderVideoSpec } from "./stakeholderData";

const jakarta = loadJakarta("normal", { weights: ["400", "600", "700", "800"], subsets: ["latin"] });
const dm = loadDM("normal", { weights: ["400", "500", "700"], subsets: ["latin"] });

const panel: React.CSSProperties = {
  border: `1px solid ${C.border}`,
  background: "rgba(255,255,255,0.08)",
  boxShadow: "0 28px 80px rgba(0,0,0,0.3)",
};

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

const fade = (frame: number, start: number, end: number) => interpolate(frame, [start, end], [0, 1], clamp);

const moveIn = (frame: number, fps: number, delay: number, distance = 30) => {
  const s = spring({ frame: frame - delay, fps, config: { damping: 180, stiffness: 90 } });
  return {
    opacity: interpolate(s, [0, 1], [0, 1]),
    transform: `translateY(${interpolate(s, [0, 1], [distance, 0])}px)`,
  };
};

const Kicker: React.FC<{ children: React.ReactNode; accent: string }> = ({ children, accent }) => (
  <div
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 12,
      color: C.off,
      fontFamily: dm.fontFamily,
      fontSize: 21,
      fontWeight: 700,
      textTransform: "uppercase",
    }}
  >
    <span style={{ width: 12, height: 12, background: accent }} />
    {children}
  </div>
);

const ModuleCard: React.FC<{
  spec: StakeholderVideoSpec;
  index: number;
  active: boolean;
  frame: number;
}> = ({ spec, index, active, frame }) => {
  const item = spec.modules[index];
  const appear = fade(frame, 10 + index * 6, 24 + index * 6);

  return (
    <div
      style={{
        ...panel,
        opacity: appear,
        transform: `translateY(${interpolate(appear, [0, 1], [20, 0])}px)`,
        borderRadius: 8,
        padding: "17px 18px",
        minHeight: 124,
        borderColor: active ? spec.accent : C.border,
        background: active ? `${spec.accent}20` : "rgba(255,255,255,0.06)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div style={{ color: active ? spec.accent : C.white, fontSize: 22, fontWeight: 800 }}>
          {item?.name}
        </div>
        <div style={{ color: C.slate, fontSize: 14, fontWeight: 700 }}>{item?.surface}</div>
      </div>
      <div style={{ color: C.off, fontSize: 17, lineHeight: 1.28, marginTop: 10 }}>{item?.action}</div>
    </div>
  );
};

const PortalScopeScene: React.FC<{ spec: StakeholderVideoSpec; localFrame?: number }> = ({ spec, localFrame }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = localFrame ?? frame;
  const active = Math.min(spec.modules.length - 1, Math.floor(f / 34));

  return (
    <AbsoluteFill style={{ padding: "58px 76px", fontFamily: jakarta.fontFamily }}>
      <div style={{ ...moveIn(f, fps, 2), display: "flex", justifyContent: "space-between", alignItems: "end" }}>
        <div>
          <Kicker accent={spec.accent}>{spec.audience}</Kicker>
          <h1 style={{ color: C.white, fontSize: 74, lineHeight: 1, margin: "20px 0 0", fontWeight: 800 }}>
            {spec.title}
          </h1>
        </div>
        <div style={{ color: spec.accent, fontFamily: dm.fontFamily, fontSize: 25, fontWeight: 800 }}>
          Scope: {spec.route}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.05fr 0.95fr", gap: 30, marginTop: 42 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
          {spec.modules.map((_, index) => (
            <ModuleCard key={spec.modules[index]?.name} spec={spec} index={index} active={index === active} frame={f} />
          ))}
        </div>

        <div
          style={{
            ...panel,
            borderRadius: 8,
            padding: 28,
            minHeight: 560,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ color: C.slate, fontFamily: dm.fontFamily, fontSize: 18, fontWeight: 800, textTransform: "uppercase" }}>
              Module in function
            </div>
            <div style={{ color: spec.accent, fontSize: 48, lineHeight: 1.05, fontWeight: 800, marginTop: 18 }}>
              {spec.modules[active]?.name}
            </div>
            <div style={{ marginTop: 28, display: "grid", gap: 16 }}>
              <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: 20 }}>
                <div style={{ color: C.slate, fontSize: 16, fontWeight: 800 }}>ACTS ON</div>
                <div style={{ color: C.white, fontFamily: dm.fontFamily, fontSize: 27, lineHeight: 1.25, marginTop: 8 }}>
                  {spec.modules[active]?.action}
                </div>
              </div>
              <div style={{ border: `1px solid ${spec.accent}`, borderRadius: 8, padding: 20, background: `${spec.accent}18` }}>
                <div style={{ color: spec.accent, fontSize: 16, fontWeight: 800 }}>VALUE</div>
                <div style={{ color: C.white, fontFamily: dm.fontFamily, fontSize: 30, lineHeight: 1.18, marginTop: 8, fontWeight: 700 }}>
                  {spec.modules[active]?.value}
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            {spec.modules.map((module, index) => (
              <div
                key={module.name}
                style={{
                  height: 10,
                  flex: 1,
                  background: index <= active ? spec.accent : "rgba(255,255,255,0.16)",
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

const ModuleDeepDiveScene: React.FC<{ spec: StakeholderVideoSpec; moduleIndex: number; localFrame: number }> = ({
  spec,
  moduleIndex,
  localFrame,
}) => {
  const { fps } = useVideoConfig();
  const module = spec.modules[moduleIndex];
  const entry = moveIn(localFrame, fps, 4, 36);
  const progress = fade(localFrame, 18, 246);

  return (
    <AbsoluteFill style={{ padding: "68px 86px", fontFamily: jakarta.fontFamily }}>
      <div style={{ ...entry, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Kicker accent={spec.accent}>
          Module {moduleIndex + 1} of {spec.modules.length}
        </Kicker>
        <div style={{ color: spec.accent, fontFamily: dm.fontFamily, fontSize: 24, fontWeight: 800 }}>
          {module?.surface}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "0.9fr 1.1fr", gap: 34, marginTop: 42, alignItems: "stretch" }}>
        <div style={{ ...moveIn(localFrame, fps, 14, 44), minHeight: 720 }}>
          <h2 style={{ color: C.white, fontSize: 84, lineHeight: 0.98, margin: 0, fontWeight: 800 }}>
            {module?.name}
          </h2>
          <div style={{ color: C.off, fontFamily: dm.fontFamily, fontSize: 32, lineHeight: 1.25, marginTop: 32 }}>
            {module?.action}
          </div>

          <div style={{ marginTop: 46, display: "grid", gap: 16 }}>
            {spec.dashboardModules.slice(0, 5).map((item, index) => (
              <div
                key={item}
                style={{
                  border: `1px solid ${item.toLowerCase().includes(module?.name.toLowerCase().split(" ")[0] ?? "") ? spec.accent : C.border}`,
                  background: item.toLowerCase().includes(module?.name.toLowerCase().split(" ")[0] ?? "")
                    ? `${spec.accent}1a`
                    : "rgba(255,255,255,0.05)",
                  borderRadius: 8,
                  padding: "15px 18px",
                  color: C.white,
                  fontFamily: dm.fontFamily,
                  fontSize: 22,
                  fontWeight: 700,
                  opacity: fade(localFrame, 34 + index * 7, 46 + index * 7),
                }}
              >
                {item}
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateRows: "1fr 1fr", gap: 22 }}>
          <div style={{ ...panel, borderRadius: 8, padding: 30, ...moveIn(localFrame, fps, 24, 36) }}>
            <div style={{ color: C.slate, fontFamily: dm.fontFamily, fontSize: 20, fontWeight: 800, textTransform: "uppercase" }}>
              Function
            </div>
            <div style={{ color: C.white, fontSize: 43, lineHeight: 1.08, fontWeight: 800, marginTop: 22 }}>
              What the user does
            </div>
            <div style={{ color: C.off, fontFamily: dm.fontFamily, fontSize: 29, lineHeight: 1.28, marginTop: 22 }}>
              {module?.action}
            </div>
          </div>

          <div
            style={{
              ...panel,
              borderColor: spec.accent,
              background: `${spec.accent}17`,
              borderRadius: 8,
              padding: 30,
              ...moveIn(localFrame, fps, 44, 36),
            }}
          >
            <div style={{ color: spec.accent, fontFamily: dm.fontFamily, fontSize: 20, fontWeight: 800, textTransform: "uppercase" }}>
              Value added
            </div>
            <div style={{ color: C.white, fontSize: 43, lineHeight: 1.08, fontWeight: 800, marginTop: 22 }}>
              Why it matters
            </div>
            <div style={{ color: C.white, fontFamily: dm.fontFamily, fontSize: 31, lineHeight: 1.2, marginTop: 22, fontWeight: 700 }}>
              {module?.value}
            </div>
          </div>
        </div>
      </div>

      <div style={{ position: "absolute", left: 86, right: 86, bottom: 52, height: 8, background: "rgba(255,255,255,0.14)" }}>
        <div style={{ height: "100%", width: `${progress * 100}%`, background: spec.accent }} />
      </div>
    </AbsoluteFill>
  );
};

const WorkflowScene: React.FC<{ spec: StakeholderVideoSpec; localFrame?: number }> = ({ spec, localFrame }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = localFrame ?? frame;
  const active = Math.min(spec.workflow.length - 1, Math.floor(f / 58));

  return (
    <AbsoluteFill style={{ padding: "76px 92px", fontFamily: jakarta.fontFamily }}>
      <div style={moveIn(f, fps, 2)}>
        <Kicker accent={spec.accent}>Workflow value chain</Kicker>
        <h2 style={{ color: C.white, fontSize: 78, lineHeight: 1.02, margin: "22px 0 0", fontWeight: 800, maxWidth: 1180 }}>
          One stakeholder journey, mapped to the modules they use.
        </h2>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: `repeat(${spec.workflow.length}, 1fr)`, gap: 14, marginTop: 62 }}>
        {spec.workflow.map((step, index) => {
          const appear = fade(f, 12 + index * 15, 32 + index * 15);
          return (
            <div key={step} style={{ opacity: appear }}>
              <div
                style={{
                  border: `2px solid ${index === active ? spec.accent : C.border}`,
                  background: index === active ? `${spec.accent}1f` : "rgba(255,255,255,0.05)",
                  borderRadius: 8,
                  minHeight: 150,
                  padding: 18,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ color: spec.accent, fontFamily: dm.fontFamily, fontSize: 18, fontWeight: 800 }}>
                  0{index + 1}
                </div>
                <div style={{ color: C.white, fontSize: 29, fontWeight: 800, lineHeight: 1.08 }}>{step}</div>
              </div>
              {index < spec.workflow.length - 1 ? (
                <div
                  style={{
                    height: 3,
                    background: spec.accent,
                    opacity: fade(f, 45 + index * 15, 64 + index * 15),
                    margin: "20px -14px 0 0",
                  }}
                />
              ) : null}
            </div>
          );
        })}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.15fr 0.85fr", gap: 28, marginTop: 48 }}>
        <div style={{ ...panel, borderRadius: 8, padding: 30 }}>
          <div style={{ color: C.slate, fontFamily: dm.fontFamily, fontSize: 18, fontWeight: 800, textTransform: "uppercase" }}>
            Benefits per stakeholder
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginTop: 22 }}>
            {spec.outcomes.map((outcome, index) => (
              <div key={outcome} style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: 20, minHeight: 132 }}>
                <div style={{ color: spec.accent, fontSize: 18, fontWeight: 800 }}>Value {index + 1}</div>
                <div style={{ color: C.white, fontFamily: dm.fontFamily, fontSize: 25, lineHeight: 1.15, marginTop: 16, fontWeight: 700 }}>
                  {outcome}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ ...panel, borderRadius: 8, padding: 30, borderColor: spec.accent }}>
          <div style={{ color: C.slate, fontFamily: dm.fontFamily, fontSize: 18, fontWeight: 800, textTransform: "uppercase" }}>
            Primary action
          </div>
          <div style={{ color: spec.accent, fontSize: 48, lineHeight: 1.05, fontWeight: 800, marginTop: 30 }}>
            {spec.cta}
          </div>
          <div style={{ color: C.off, fontFamily: dm.fontFamily, fontSize: 24, lineHeight: 1.3, marginTop: 24 }}>
            {spec.promise}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

const ClosingScene: React.FC<{ spec: StakeholderVideoSpec }> = ({ spec }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ padding: "96px 118px", fontFamily: jakarta.fontFamily, justifyContent: "center" }}>
      <div style={moveIn(frame, fps, 2, 42)}>
        <Kicker accent={spec.accent}>MaiProp listing portal</Kicker>
        <h2 style={{ color: C.white, fontSize: 102, lineHeight: 0.98, margin: "32px 0 0", fontWeight: 800, maxWidth: 1180 }}>
          Role-specific modules that turn activity into value.
        </h2>
        <div style={{ color: C.off, fontFamily: dm.fontFamily, fontSize: 35, lineHeight: 1.28, marginTop: 34, maxWidth: 940 }}>
          {spec.subtitle}
        </div>
        <div
          style={{
            marginTop: 54,
            display: "inline-flex",
            alignItems: "center",
            gap: 18,
            border: `2px solid ${spec.accent}`,
            borderRadius: 8,
            padding: "22px 28px",
            color: spec.accent,
            fontFamily: dm.fontFamily,
            fontSize: 31,
            fontWeight: 800,
          }}
        >
          {spec.cta}
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const StakeholderVideo: React.FC<{ spec: StakeholderVideoSpec }> = ({ spec }) => {
  const frame = useCurrentFrame();
  const introFrames = 210;
  const moduleFrames = 270;
  const workflowFrames = 390;
  const moduleBlockEnd = introFrames + spec.modules.length * moduleFrames;
  const workflowEnd = moduleBlockEnd + workflowFrames;
  const moduleIndex = Math.min(
    spec.modules.length - 1,
    Math.max(0, Math.floor((frame - introFrames) / moduleFrames)),
  );

  return (
    <AbsoluteFill style={{ background: C.navyDeep, overflow: "hidden" }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(960px 740px at 16% 26%, ${spec.accent}26, transparent 62%), radial-gradient(940px 680px at 84% 78%, ${C.indigo}2e, transparent 66%), ${C.navyDeep}`,
        }}
      />
      <AbsoluteFill
        style={{
          backgroundImage: `linear-gradient(${C.border} 1px, transparent 1px), linear-gradient(90deg, ${C.border} 1px, transparent 1px)`,
          backgroundSize: "72px 72px",
          opacity: 0.2,
        }}
      />
      {frame < introFrames ? <PortalScopeScene spec={spec} localFrame={frame} /> : null}
      {frame >= introFrames && frame < moduleBlockEnd ? (
        <ModuleDeepDiveScene
          spec={spec}
          moduleIndex={moduleIndex}
          localFrame={frame - introFrames - moduleIndex * moduleFrames}
        />
      ) : null}
      {frame >= moduleBlockEnd && frame < workflowEnd ? (
        <WorkflowScene spec={spec} localFrame={frame - moduleBlockEnd} />
      ) : null}
      {frame >= workflowEnd ? <ClosingScene spec={spec} /> : null}
    </AbsoluteFill>
  );
};
