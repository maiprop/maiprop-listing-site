/** Presentation for stored walk scores; no score is inferred from AI suggestions. */

export function walkScoreLabel(score: number): string {
  if (score >= 90) return "Walker's Paradise";
  if (score >= 70) return "Very Walkable";
  if (score >= 50) return "Walkable";
  if (score >= 25) return "Some Errands";
  return "Car Dependent";
}

export function walkScoreColour(score: number): string {
  if (score >= 80) return "#22c55e";  // green
  if (score >= 60) return "#84cc16";  // lime
  if (score >= 40) return "#eab308";  // yellow
  if (score >= 20) return "#f97316";  // orange
  return "#ef4444";                    // red
}
