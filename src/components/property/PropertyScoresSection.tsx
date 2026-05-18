/**
 * Displays the Walk Score, Safety Score, and Noise Level gauge cards
 * in the property detail sidebar. All values are optional — cards only
 * render when data is present.
 *
 * Data loading lives in PropertyDetail.tsx; this component is pure display.
 */

import { walkScoreLabel, walkScoreColour } from "@/lib/walkScore";

interface Props {
  /** Runtime walk score from POIs API (null if not yet fetched) */
  walkScore: number | null;
  /** DB fallback walk score from neighbourhood report */
  walkabilityScore: number | null;
  /** Safety score 0-100 (null if not stored) */
  safetyScore: number | null;
  /** Noise level 0-10 (null if not stored) */
  noiseScore: number | null;
}

// skipcq: JS-0067 - Small presentational helper is intentionally module-scoped.
function ScoreRing({
  score,
  max,
  colour,
  label,
  subtitle,
  note,
}: {
  score: number;
  max: number;
  colour: string;
  label: string;
  subtitle: string;
  note?: string;
}) {
  const r = 20;
  const c = 2 * Math.PI * r;
  const fraction = score / max;
  return (
    <div className="flex items-center gap-3">
      <svg width="52" height="52" viewBox="0 0 56 56" className="shrink-0">
        <circle cx="28" cy="28" r={r} fill="none" stroke="hsl(var(--border))" strokeWidth="4" />
        <circle
          cx="28" cy="28" r={r} fill="none"
          stroke={colour} strokeWidth="4"
          strokeDasharray={`${c * fraction} ${c * (1 - fraction)}`}
          strokeLinecap="round"
          transform="rotate(-90 28 28)"
        />
        <text x="28" y="33" textAnchor="middle" fontSize="13" fontWeight="900" fill={colour}>
          {score}
        </text>
      </svg>
      <div>
        <p className="text-sm font-bold" style={{ color: colour }}>{label}</p>
        <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">{subtitle}</p>
        {note && <p className="text-[10px] text-muted-foreground mt-0.5">{note}</p>}
      </div>
    </div>
  );
}

// skipcq: JS-0067 - Exported React component is intentionally module-scoped.
export function PropertyScoresSection({ walkScore, walkabilityScore, safetyScore, noiseScore }: Props) { // skipcq: JS-R1005 - Score cards intentionally render optional walk, safety, and noise sections together.
  const resolvedWalkScore = walkScore ?? walkabilityScore;
  const hasWalk = resolvedWalkScore !== null;
  const hasSafetyOrNoise = safetyScore !== null || noiseScore !== null;

  if (!hasWalk && !hasSafetyOrNoise) return null;

  return (
    <>
      {resolvedWalkScore !== null && (() => {
        const score = resolvedWalkScore;
        const colour = walkScoreColour(score);
        const label = walkScoreLabel(score);
        return (
          <div className="glass-card rounded-2xl p-4 border border-border flex items-center gap-4">
            <ScoreRing
              score={score}
              max={100}
              colour={colour}
              label={label}
              subtitle="Walk Score"
              note="Based on nearby amenities"
            />
          </div>
        );
      })()}

      {hasSafetyOrNoise && (
        <div className="glass-card rounded-2xl p-4 border border-border flex items-center gap-6">
          {safetyScore !== null && (() => {
            const s = safetyScore;
            const colour = s >= 70 ? "#22c55e" : s >= 40 ? "#f59e0b" : "#ef4444";
            const label = s >= 70 ? "Safe area" : s >= 40 ? "Moderate" : "Caution";
            return (
              <ScoreRing
                score={s}
                max={100}
                colour={colour}
                label={label}
                subtitle="Safety Score"
              />
            );
          })()}

          {noiseScore !== null && (() => {
            const n = noiseScore;
            const colour = n <= 3 ? "#22c55e" : n <= 6 ? "#f59e0b" : "#ef4444";
            const label = n <= 3 ? "Quiet" : n <= 6 ? "Moderate" : "Noisy";
            return (
              <div className="flex items-center gap-3">
                <div
                  className="w-[52px] h-[52px] rounded-full border-4 flex items-center justify-center shrink-0"
                  style={{ borderColor: colour }}
                >
                  <span className="text-sm font-black" style={{ color: colour }}>{n}</span>
                </div>
                <div>
                  <p className="text-sm font-bold" style={{ color: colour }}>{label}</p>
                  <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
                    Noise Level
                  </p>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </>
  );
}
