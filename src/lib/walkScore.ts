/**
 * Compute a 0-100 walk score from POI proximity data.
 *
 * Revised algorithm — uses a gentler exponential decay so urban Greek
 * properties (with POIs within 200–500 m) score realistically (60-90+)
 * rather than near-zero.
 *
 *  sub-score = max(0, 1 - (d / maxKm)^1.5)  × weight
 *
 * maxKm thresholds are generous for dense Greek cities.
 */

export interface POIForScore {
  distanceKm: number;
  category: string;
}

const CATEGORY_WEIGHTS: Record<string, number> = {
  transit:  25,
  school:   12,
  shopping: 20,
  cafe:     13,
  park:     15,
  hospital:  8,
  restaurant: 7,
};

const MAX_USEFUL_KM: Record<string, number> = {
  transit:  1.2,
  school:   2.0,
  shopping: 1.5,
  cafe:     1.0,
  park:     1.5,
  hospital: 3.0,
  restaurant: 1.0,
};

export function computeWalkScore(pois: POIForScore[]): number {
  if (!pois || pois.length === 0) return 0;

  let totalScore = 0;
  let totalWeight = 0;

  for (const [category, weight] of Object.entries(CATEGORY_WEIGHTS)) {
    const closest = pois
      .filter(p => p.category === category)
      .sort((a, b) => a.distanceKm - b.distanceKm)[0];

    totalWeight += weight;

    if (!closest) continue;

    const maxKm = MAX_USEFUL_KM[category] ?? 1.5;
    // gentler exponent (1.5 → 2.0 range) means modest distance still scores well
    const ratio = closest.distanceKm / maxKm;
    const decay = Math.max(0, 1 - Math.pow(ratio, 1.5));
    totalScore += decay * weight;
  }

  if (totalWeight === 0) return 0;
  return Math.round((totalScore / totalWeight) * 100);
}

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
