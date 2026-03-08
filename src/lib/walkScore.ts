export interface POIForScore {
  distanceKm: number;
  category: string;
}

/**
 * Compute a 0-100 walk score from POI proximity data.
 * Algorithm mirrors Walk Score methodology:
 * - Each category contributes a weighted sub-score based on closest POI distance
 * - Decay function: score = max(0, 1 - (distKm / maxKm)^0.6) * weight
 */
const CATEGORY_WEIGHTS: Record<string, number> = {
  transit:  25,
  school:   15,
  shopping: 20,
  cafe:     15,
  park:     15,
  hospital: 10,
};

const MAX_USEFUL_KM: Record<string, number> = {
  transit:  0.6,
  school:   1.2,
  shopping: 0.8,
  cafe:     0.5,
  park:     0.8,
  hospital: 2.0,
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

    const maxKm = MAX_USEFUL_KM[category] ?? 1.0;
    const decay = Math.max(0, 1 - Math.pow(closest.distanceKm / maxKm, 0.6));
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
