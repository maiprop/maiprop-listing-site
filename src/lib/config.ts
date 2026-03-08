// Public configuration constants
// These are publishable/public keys safe to store in client code.

// Mapbox public token — publishable key, safe to commit
export const MAPBOX_TOKEN =
  (import.meta as any).env?.VITE_MAPBOX_TOKEN ??
  "pk.eyJ1Ijoia3JlbmlvczkyIiwiYSI6ImNtbWh0MjlxYjBza3YydXBqcThqeXBoYmcifQ.BElf3IJI7DGBjj2o2dTDqw";
