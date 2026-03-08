// Public configuration constants
// These are publishable/public keys safe to store in client code.

// Mapbox public token — set via project secrets as MAPBOX_TOKEN
// Fallback ensures map renders in development
export const MAPBOX_TOKEN = (import.meta as any).env?.VITE_MAPBOX_TOKEN ?? "";
