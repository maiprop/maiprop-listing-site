/**
 * seed-production-listings.ts
 * Wipes all non-auction listings + all professionals, then re-seeds realistic
 * Greek real estate data covering every available property typology.
 *
 * Run: I_KNOW_THIS_IS_PROD=yes npx tsx scripts/seed-production-listings.ts
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";
import { assertNotProduction } from "./_prod-guard";
import { getSeedEnv } from "./_seed-env";

try {
  const envPath = resolve(process.cwd(), ".env");
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
    if (m) process.env[m[1].trim()] ??= m[2].trim().replace(/^["']|["']$/g, "");
  }
} catch { /* rely on shell */ }

const { supabaseUrl: SUPABASE_URL, serviceRoleKey: SERVICE_ROLE_KEY } = getSeedEnv();
assertNotProduction(SUPABASE_URL, "seed-production-listings.ts");

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function getUserIdByEmail(email: string): Promise<string | null> {
  const { data } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  return data?.users?.find((u) => u.email === email)?.id ?? null;
}

function daysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

interface Owners {
  sellerFree: string; sellerPro: string;
  agentFree: string; agentPro: string;
  developerFree: string; developerPro: string;
  architectFree: string; architectPro: string;
  lawyerFree: string; lawyerPro: string;
  engineerFree: string; engineerPro: string;
  notaryFree: string; notaryPro: string;
  managerFree: string; managerPro: string;
  advisorPro: string; valuerPro: string;
}

async function resolveOwners(): Promise<Owners> {
  const lookup = async (email: string): Promise<string> => {
    const id = await getUserIdByEmail(email);
    if (!id) throw new Error("Demo account not found: " + email);
    return id;
  };
  return {
    sellerFree: await lookup("seller.free@maiprop.demo"),
    sellerPro:  await lookup("seller.pro@maiprop.demo"),
    agentFree:  await lookup("agent.free@maiprop.demo"),
    agentPro:   await lookup("agent.pro@maiprop.demo"),
    developerFree: await lookup("developer.free@maiprop.demo"),
    developerPro:  await lookup("developer.pro@maiprop.demo"),
    architectFree: await lookup("architect.free@maiprop.demo"),
    architectPro:  await lookup("architect.pro@maiprop.demo"),
    lawyerFree:    await lookup("lawyer.free@maiprop.demo"),
    lawyerPro:     await lookup("lawyer.pro@maiprop.demo"),
    engineerFree:  await lookup("engineer.free@maiprop.demo"),
    engineerPro:   await lookup("engineer.pro@maiprop.demo"),
    notaryFree:    await lookup("notary.free@maiprop.demo"),
    notaryPro:     await lookup("notary.pro@maiprop.demo"),
    managerFree:   await lookup("manager.free@maiprop.demo"),
    managerPro:    await lookup("manager.pro@maiprop.demo"),
    advisorPro:    await lookup("advisor.pro@maiprop.demo"),
    valuerPro:     await lookup("valuer.pro@maiprop.demo"),
  };
}

async function wipe(): Promise<void> {
  console.log("Deleting all non-auction listings...");
  const { error: lErr } = await supabase.from("listings").delete()
    .in("listing_type", ["sale", "rent", "open_house", "firesale"]);
  if (lErr) throw new Error("Listings delete: " + lErr.message);
  console.log("  ok - listings deleted");

  console.log("Deleting all professionals...");
  const { error: pErr } = await supabase.from("professionals").delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  if (pErr) throw new Error("Professionals delete: " + pErr.message);
  console.log("  ok - professionals deleted");
}
// ---- LISTINGS ---------------------------------------------------------------
type ListingRow = Record<string, unknown>;

function makeListings(o: Owners): ListingRow[] {
  const B = { status: "active", cover_image_url: null, views_count: 0, priority_placement: 0, is_featured: false, is_pre_sale: false, is_off_market: false };
  return [
    // FOR SALE - seller.free (10 listings, diverse types)
    { ...B, owner_id: o.sellerFree, listing_type: "sale", property_type: "apartment", city: "Athens", address: "27 Varnali St, Pagrati, Athens", title: "2BR Apartment in Pagrati — Owner Selling", description: "Well-maintained 75m² apartment on the 3rd floor in Pagrati. Renovated kitchen, autonomous gas, south-facing. No commission.", price: 175000, sqm: 75, bedrooms: 2, bathrooms: 1, floor: 3, total_floors: 6, year_built: 1982, energy_class: "C", heating_system: "autonomous_gas", has_parking: false, has_elevator: true, has_balcony: true, has_ac: true, price_per_sqm: 2333, latitude: 37.9688, longitude: 23.7492 },
    { ...B, owner_id: o.sellerFree, listing_type: "sale", property_type: "studio", city: "Athens", address: "5 Ifaistou St, Monastiraki, Athens", title: "Studio in Monastiraki — Investment Opportunity", description: "38m² studio at ground level in historic Monastiraki. Excellent Airbnb potential. Selling directly — no agency fees.", price: 72000, sqm: 38, bedrooms: 1, bathrooms: 1, floor: 0, total_floors: 4, year_built: 1968, energy_class: "E", heating_system: "autonomous_gas", has_parking: false, has_elevator: false, has_balcony: false, has_ac: true, price_per_sqm: 1895, latitude: 37.9760, longitude: 23.7244, suitable_investment: true },
    { ...B, owner_id: o.sellerFree, listing_type: "sale", property_type: "maisonette", city: "Volos", address: "14 Dimitriados St, Nea Ionia, Volos", title: "Maisonette 3BR in Volos — Quiet Suburb", description: "Spacious split-level maisonette 115m² with private garden and covered parking in Volos. Owner relocating.", price: 165000, sqm: 115, bedrooms: 3, bathrooms: 2, floor: 1, total_floors: 2, year_built: 1995, energy_class: "D", heating_system: "autonomous_gas", has_parking: true, has_elevator: false, has_balcony: true, has_ac: true, price_per_sqm: 1435, latitude: 39.3665, longitude: 22.9402 },
    { ...B, owner_id: o.sellerFree, listing_type: "sale", property_type: "office", city: "Marousi", address: "42 Kifissias Ave, Marousi", title: "Office Space 80m² — Marousi Business District", description: "Modern fitted office on the 2nd floor in Marousi central business corridor. Open plan, meeting room, fibre ready.", price: 195000, sqm: 80, bedrooms: 0, bathrooms: 1, floor: 2, total_floors: 5, year_built: 2007, energy_class: "B", heating_system: "central_gas", has_parking: true, has_elevator: true, has_balcony: false, has_ac: true, price_per_sqm: 2438, latitude: 38.0561, longitude: 23.8070 },
    { ...B, owner_id: o.sellerFree, listing_type: "sale", property_type: "land", city: "Lavrio", address: "Odos Poseidonos, Lavrio", title: "Land Plot 480m² — Lavrio, Attika Coast", description: "Corner buildable plot 480m² in residential zone of Lavrio. FAR allows 250m² residence. Utilities connected.", price: 88000, sqm: 480, bedrooms: 0, bathrooms: 0, floor: 0, total_floors: 0, year_built: 0, energy_class: null, heating_system: null, has_parking: false, has_elevator: false, has_balcony: false, has_view: true, has_ac: false, price_per_sqm: 183, latitude: 37.7158, longitude: 24.0580 },
    { ...B, owner_id: o.sellerFree, listing_type: "sale", property_type: "parking", city: "Athens", address: "3 Amalias Ave, Syntagma, Athens", title: "Parking Space — Athens City Centre", description: "Covered individual parking space 15m² in underground garage near Syntagma. Clear title, sold separately.", price: 28000, sqm: 15, bedrooms: 0, bathrooms: 0, floor: -1, total_floors: 0, year_built: 2001, energy_class: null, heating_system: null, has_parking: false, has_elevator: true, has_balcony: false, has_ac: false, price_per_sqm: 1867, latitude: 37.9755, longitude: 23.7352 },
    { ...B, owner_id: o.sellerFree, listing_type: "sale", property_type: "storage", city: "Piraeus", address: "18 Akti Kondyli, Piraeus", title: "Storage Unit 22m² — Piraeus Port Area", description: "Ground-floor storage unit 22m² near Piraeus Gate E6. Double-door, security-alarm ready. Direct title transfer.", price: 19500, sqm: 22, bedrooms: 0, bathrooms: 0, floor: 0, total_floors: 0, year_built: 1998, energy_class: null, heating_system: null, has_parking: false, has_elevator: false, has_balcony: false, has_ac: false, price_per_sqm: 886, latitude: 37.9454, longitude: 23.6418 },
    { ...B, owner_id: o.sellerFree, listing_type: "sale", property_type: "house", city: "Thessaloniki", address: "9 Venizelou St, Kalamaria, Thessaloniki", title: "House 4BR — Thessaloniki Kalamaria", description: "Detached two-storey house 195m² in Kalamaria, Thessaloniki. Large garden, double garage, walking to seafront.", price: 295000, sqm: 195, bedrooms: 4, bathrooms: 3, floor: 0, total_floors: 2, year_built: 2003, energy_class: "C", heating_system: "autonomous_gas", has_parking: true, has_elevator: false, has_balcony: true, has_garden: true, has_ac: true, price_per_sqm: 1513, latitude: 40.5824, longitude: 22.9480 },
    { ...B, owner_id: o.sellerFree, listing_type: "sale", property_type: "commercial", city: "Piraeus", address: "31 Iroon Polytechneiou St, Piraeus", title: "Commercial Unit 95m² — Ground Floor, Piraeus", description: "Ground-floor retail 95m² on busy pedestrian street in Piraeus centre. Two WC, storage, security shutters.", price: 168000, sqm: 95, bedrooms: 0, bathrooms: 2, floor: 0, total_floors: 4, year_built: 1980, energy_class: "E", heating_system: "autonomous_gas", has_parking: false, has_elevator: false, has_balcony: false, has_ac: true, price_per_sqm: 1768, latitude: 37.9478, longitude: 23.6432 },
    { ...B, owner_id: o.sellerFree, listing_type: "sale", property_type: "land", city: "Heraklion", address: "Eparchial Road Heraklion-Archanes, Crete", title: "Agricultural Land 1.8 Stremma — Heraklion", description: "Flat agricultural plot 1,800m² with olive grove, 12km south of Heraklion. Well water on site. Road access.", price: 55000, sqm: 1800, bedrooms: 0, bathrooms: 0, floor: 0, total_floors: 0, year_built: 0, energy_class: null, heating_system: null, has_parking: false, has_elevator: false, has_balcony: false, has_view: true, has_ac: false, price_per_sqm: 31, latitude: 35.2912, longitude: 25.1328 },

    // FOR SALE - seller.pro (10 listings, premium + diverse)
    { ...B, owner_id: o.sellerPro, listing_type: "sale", property_type: "villa", city: "Glyfada", address: "16 Poseidonos Ave, Glyfada", title: "Luxury Villa with Pool — Glyfada Riviera", description: "Elegant villa 250m² on 550m² plot in Glyfada. Four bedrooms, heated pool, double garage. Renovated 2022.", price: 1250000, sqm: 250, bedrooms: 4, bathrooms: 3, floor: 0, total_floors: 2, year_built: 2008, energy_class: "A", heating_system: "heat_pump", has_parking: true, has_elevator: false, has_balcony: true, has_view: true, has_ac: true, has_pool: true, has_garden: true, price_per_sqm: 5000, latitude: 37.8640, longitude: 23.7510, is_featured: true, priority_placement: 2 },
    { ...B, owner_id: o.sellerPro, listing_type: "sale", property_type: "apartment", city: "Vouliagmeni", address: "8 Apollonos St, Vouliagmeni", title: "Penthouse 160m² — Vouliagmeni Sea Views", description: "Top-floor penthouse 160m² with sweeping Vouliagmeni Bay views. 55m² wraparound terrace, underground parking.", price: 950000, sqm: 160, bedrooms: 3, bathrooms: 2, floor: 6, total_floors: 6, year_built: 2015, energy_class: "A+", heating_system: "heat_pump", has_parking: true, has_elevator: true, has_balcony: true, has_view: true, has_ac: true, price_per_sqm: 5938, latitude: 37.8095, longitude: 23.7808, is_featured: true, priority_placement: 2 },
    { ...B, owner_id: o.sellerPro, listing_type: "sale", property_type: "mixed_use", city: "Athens", address: "22 Themistokleous St, Exarchia, Athens", title: "Mixed-Use Building — Athens Exarchia", description: "Three-storey 480m² mixed-use in Exarchia. Ground floor retail leased EUR 1,100/mo; upper offices + 3BR residential. Yield 4.2%.", price: 620000, sqm: 480, bedrooms: 3, bathrooms: 4, floor: 0, total_floors: 3, year_built: 1975, energy_class: "D", heating_system: "central_gas", has_parking: false, has_elevator: false, has_balcony: false, has_ac: true, price_per_sqm: 1292, latitude: 37.9834, longitude: 23.7281, suitable_investment: true },
    { ...B, owner_id: o.sellerPro, listing_type: "sale", property_type: "hotel", city: "Mykonos", address: "Odos Matogianni, Mykonos Town", title: "Boutique Hotel 18 Rooms — Mykonos Town", description: "Fully operational 18-room boutique hotel 200m from Mykonos port. Pool, roof terrace, restaurant licence. RevPAR EUR 220 peak.", price: 4800000, sqm: 720, bedrooms: 18, bathrooms: 18, floor: 0, total_floors: 3, year_built: 1990, energy_class: "C", heating_system: "central_gas", has_parking: true, has_elevator: false, has_balcony: true, has_view: true, has_ac: true, has_pool: true, price_per_sqm: 6667, latitude: 37.4467, longitude: 25.3290, is_featured: true, priority_placement: 2, suitable_investment: true },
    { ...B, owner_id: o.sellerPro, listing_type: "sale", property_type: "warehouse", city: "Piraeus", address: "55 Agiou Georgiou St, Keratsini", title: "Industrial Warehouse 600m² — Piraeus Zone", description: "Single-storey warehouse 600m² with 8m clear height, two loading docks, 3-phase power. 1,000m² fenced plot.", price: 485000, sqm: 600, bedrooms: 0, bathrooms: 2, floor: 0, total_floors: 1, year_built: 1999, energy_class: null, heating_system: null, has_parking: true, has_elevator: false, has_balcony: false, has_ac: false, price_per_sqm: 808, latitude: 37.9637, longitude: 23.6121, suitable_investment: true },
    { ...B, owner_id: o.sellerPro, listing_type: "sale", property_type: "house", city: "Kifisia", address: "11 Kolokotroni St, Kifisia", title: "4BR Family House — Kifisia, North Athens", description: "Elegant family home 230m² on quiet tree-lined street in Kifisia. Four bedrooms, rear garden, double garage.", price: 695000, sqm: 230, bedrooms: 4, bathrooms: 3, floor: 0, total_floors: 2, year_built: 2005, energy_class: "B", heating_system: "autonomous_gas", has_parking: true, has_elevator: false, has_balcony: true, has_garden: true, has_ac: true, price_per_sqm: 3022, latitude: 38.0737, longitude: 23.8115 },
    { ...B, owner_id: o.sellerPro, listing_type: "sale", property_type: "villa", city: "Corfu", address: "Odos Palaiokastritsa, Corfu", title: "Villa 3BR — Corfu Old Town Outskirts", description: "Stone villa 175m² with vineyard terrace above Corfu Old Town. Private pool, olive trees. Holiday-let licensed.", price: 590000, sqm: 175, bedrooms: 3, bathrooms: 2, floor: 0, total_floors: 2, year_built: 1970, energy_class: "D", heating_system: "autonomous_gas", has_parking: true, has_elevator: false, has_balcony: true, has_view: true, has_ac: true, has_pool: true, has_garden: true, price_per_sqm: 3371, latitude: 39.6243, longitude: 19.8956 },
    { ...B, owner_id: o.sellerPro, listing_type: "sale", property_type: "office", city: "Marousi", address: "Atrium Tower, Kifissias Ave, Marousi", title: "Office Suite 220m² — Marousi Atrium Tower", description: "A-class office 220m² on 7th floor. Two meeting rooms, kitchen, 4 parking bays. Leased EUR 3,200/mo. Yield 5.1%.", price: 750000, sqm: 220, bedrooms: 0, bathrooms: 3, floor: 7, total_floors: 10, year_built: 2014, energy_class: "A", heating_system: "central_gas", has_parking: true, has_elevator: true, has_balcony: true, has_view: true, has_ac: true, price_per_sqm: 3409, latitude: 38.0580, longitude: 23.8042, suitable_investment: true },
    { ...B, owner_id: o.sellerPro, listing_type: "sale", property_type: "maisonette", city: "Thessaloniki", address: "8 Analipseos St, Panorama, Thessaloniki", title: "Maisonette 4BR — Thessaloniki Panorama", description: "Spacious maisonette 180m² in upscale Panorama suburb with panoramic city views. Renovated kitchen, private garden.", price: 380000, sqm: 180, bedrooms: 4, bathrooms: 2, floor: 1, total_floors: 2, year_built: 1998, energy_class: "C", heating_system: "autonomous_gas", has_parking: true, has_elevator: false, has_balcony: true, has_view: true, has_ac: true, has_garden: true, price_per_sqm: 2111, latitude: 40.6220, longitude: 22.9874 },
    { ...B, owner_id: o.sellerPro, listing_type: "sale", property_type: "land", city: "Rhodes", address: "Odos Kazouli, Rhodes", title: "Buildable Plot 900m² — Rhodes Old Town Fringe", description: "900m² plot on edge of UNESCO-listed Rhodes Old Town buffer zone. Zoning permits 350m² build. Ideal boutique hotel.", price: 420000, sqm: 900, bedrooms: 0, bathrooms: 0, floor: 0, total_floors: 0, year_built: 0, energy_class: null, heating_system: null, has_parking: false, has_elevator: false, has_balcony: false, has_view: true, has_ac: false, price_per_sqm: 467, latitude: 36.4396, longitude: 28.2222, suitable_investment: true },
    // FOR SALE - agent.free (14 listings)
    { ...B, owner_id: o.agentFree, listing_type: "sale", property_type: "apartment", city: "Athens", address: "44 Kypselis St, Kypseli, Athens", title: "2BR Apartment — Athens Kypseli, Priced to Sell", description: "Airy 80m² apartment on 4th floor in Kypseli. Renovated kitchen and bathroom 2019. Communal rooftop.", price: 148000, sqm: 80, bedrooms: 2, bathrooms: 1, floor: 4, total_floors: 6, year_built: 1978, energy_class: "D", heating_system: "autonomous_gas", has_parking: false, has_elevator: true, has_balcony: true, has_ac: true, price_per_sqm: 1850, latitude: 37.9924, longitude: 23.7340 },
    { ...B, owner_id: o.agentFree, listing_type: "sale", property_type: "house", city: "Palaio Faliro", address: "12 Apollonos St, Palaio Faliro", title: "3BR House — Palaio Faliro, Suburban Family Home", description: "Semi-detached house 160m² in Palaio Faliro. Three bedrooms, private garden, parking. 5 min to tram line.", price: 395000, sqm: 160, bedrooms: 3, bathrooms: 2, floor: 0, total_floors: 2, year_built: 1993, energy_class: "C", heating_system: "autonomous_gas", has_parking: true, has_elevator: false, has_balcony: true, has_garden: true, has_ac: true, price_per_sqm: 2469, latitude: 37.9257, longitude: 23.7038 },
    { ...B, owner_id: o.agentFree, listing_type: "sale", property_type: "studio", city: "Athens", address: "7 Stournari St, Exarchia, Athens", title: "Investment Studio — Exarchia, Fully Furnished", description: "40m² studio in Exarchia, ground floor. Yielding EUR 580/mo short-term rental. Fully furnished and equipped.", price: 64000, sqm: 40, bedrooms: 1, bathrooms: 1, floor: 0, total_floors: 5, year_built: 1965, energy_class: "F", heating_system: "autonomous_gas", has_parking: false, has_elevator: false, has_balcony: false, has_ac: true, has_furnished: true, price_per_sqm: 1600, latitude: 37.9847, longitude: 23.7306, suitable_investment: true },
    { ...B, owner_id: o.agentFree, listing_type: "sale", property_type: "commercial", city: "Athens", address: "18 Pandrossou St, Monastiraki, Athens", title: "Retail Shop 110m² — Monastiraki Tourist Zone", description: "Prime retail unit 110m² on Pandrossou St. 4.5m ceiling height, large display window, high foot traffic.", price: 245000, sqm: 110, bedrooms: 0, bathrooms: 1, floor: 0, total_floors: 3, year_built: 1962, energy_class: null, heating_system: "autonomous_gas", has_parking: false, has_elevator: false, has_balcony: false, has_ac: true, price_per_sqm: 2227, latitude: 37.9762, longitude: 23.7258, suitable_investment: true },
    { ...B, owner_id: o.agentFree, listing_type: "sale", property_type: "office", city: "Chalandri", address: "55 Ethnikis Antistaseos, Chalandri", title: "Office Floor 150m² — Chalandri Business Park", description: "Open-plan office 150m² in modern mid-rise, Chalandri. Three enclosed offices, kitchen, 2 parking spots.", price: 285000, sqm: 150, bedrooms: 0, bathrooms: 2, floor: 3, total_floors: 6, year_built: 2011, energy_class: "A", heating_system: "central_gas", has_parking: true, has_elevator: true, has_balcony: false, has_ac: true, price_per_sqm: 1900, latitude: 38.0212, longitude: 23.8030 },
    { ...B, owner_id: o.agentFree, listing_type: "sale", property_type: "parking", city: "Piraeus", address: "22 Karaoli & Dimitriou St, Piraeus", title: "Underground Parking Garage — Piraeus Pasalimani", description: "Three-bay underground garage 45m² near Pasalimani Marina. Electric roller door. Can be divided into 3 spaces.", price: 42000, sqm: 45, bedrooms: 0, bathrooms: 0, floor: -1, total_floors: 0, year_built: 2004, energy_class: null, heating_system: null, has_parking: false, has_elevator: false, has_balcony: false, has_ac: false, price_per_sqm: 933, latitude: 37.9398, longitude: 23.6482 },
    { ...B, owner_id: o.agentFree, listing_type: "sale", property_type: "apartment", city: "Marousi", address: "18 Irodou Attikou St, Marousi", title: "2BR Apartment — Marousi, Near Metro", description: "Bright 85m² two-bedroom on 5th floor. Renovated 2020. Five-minute walk to Marousi metro. Communal garden.", price: 188000, sqm: 85, bedrooms: 2, bathrooms: 1, floor: 5, total_floors: 7, year_built: 1989, energy_class: "C", heating_system: "central_gas", has_parking: true, has_elevator: true, has_balcony: true, has_ac: true, price_per_sqm: 2212, latitude: 38.0540, longitude: 23.8089 },
    { ...B, owner_id: o.agentFree, listing_type: "sale", property_type: "maisonette", city: "Nea Smyrni", address: "9 Eleftherias Square, Nea Smyrni", title: "Maisonette 3BR — Nea Smyrni, Athens South", description: "Well-presented 135m² maisonette over two floors in Nea Smyrni. Three bedrooms, private terrace, garage.", price: 248000, sqm: 135, bedrooms: 3, bathrooms: 2, floor: 1, total_floors: 2, year_built: 1992, energy_class: "D", heating_system: "autonomous_gas", has_parking: true, has_elevator: false, has_balcony: true, has_ac: true, price_per_sqm: 1837, latitude: 37.9478, longitude: 23.7116 },
    { ...B, owner_id: o.agentFree, listing_type: "sale", property_type: "warehouse", city: "Kifisia", address: "Odos Lamias, Kifisia Industrial Zone", title: "Warehouse 380m² — Kifisia Logistics Corridor", description: "Single-storey warehouse 380m² on 700m² fenced plot. 6.5m clear height, loading dock, 3-phase power.", price: 310000, sqm: 380, bedrooms: 0, bathrooms: 1, floor: 0, total_floors: 1, year_built: 1997, energy_class: null, heating_system: null, has_parking: true, has_elevator: false, has_balcony: false, has_ac: false, price_per_sqm: 816, latitude: 38.0830, longitude: 23.8240, suitable_investment: true },
    { ...B, owner_id: o.agentFree, listing_type: "sale", property_type: "land", city: "Voula", address: "Odos Dionysiou Aiginitou, Voula", title: "Building Plot 650m² — Voula Coastal Zone", description: "Residential plot 650m² in Voula coastal zone. FAR allows 290m² build. Walking distance to Asteria beach.", price: 280000, sqm: 650, bedrooms: 0, bathrooms: 0, floor: 0, total_floors: 0, year_built: 0, energy_class: null, heating_system: null, has_parking: false, has_elevator: false, has_balcony: false, has_view: true, has_ac: false, price_per_sqm: 431, latitude: 37.8432, longitude: 23.7740 },
    { ...B, owner_id: o.agentFree, listing_type: "sale", property_type: "storage", city: "Piraeus", address: "7 Skyrou St, Piraeus", title: "Storage Complex 3 Units — Piraeus", description: "Three adjacent storage units 18m² each (54m² total) in secure building near Piraeus Gate E5. Can sell individually.", price: 52000, sqm: 54, bedrooms: 0, bathrooms: 0, floor: 0, total_floors: 0, year_built: 1995, energy_class: null, heating_system: null, has_parking: false, has_elevator: false, has_balcony: false, has_ac: false, price_per_sqm: 963, latitude: 37.9442, longitude: 23.6404 },
    { ...B, owner_id: o.agentFree, listing_type: "sale", property_type: "apartment", city: "Thessaloniki", address: "14 Tsimiski St, Thessaloniki", title: "Apartment 2BR — Thessaloniki City Centre", description: "Centrally located 90m² apartment on 3rd floor, walking distance to White Tower. Renovated bathroom.", price: 148000, sqm: 90, bedrooms: 2, bathrooms: 1, floor: 3, total_floors: 5, year_built: 1975, energy_class: "D", heating_system: "autonomous_gas", has_parking: false, has_elevator: true, has_balcony: true, has_ac: true, price_per_sqm: 1644, latitude: 40.6335, longitude: 22.9420 },
    { ...B, owner_id: o.agentFree, listing_type: "sale", property_type: "mixed_use", city: "Varkiza", address: "Odos Apollonos, Varkiza", title: "Mixed-Use Building — Varkiza Coastal Strip", description: "Two-storey 280m² mixed-use. Ground floor retail leased EUR 1,400/mo; upper 3BR residence. Summer season traffic.", price: 380000, sqm: 280, bedrooms: 3, bathrooms: 3, floor: 0, total_floors: 2, year_built: 1988, energy_class: "E", heating_system: "autonomous_gas", has_parking: true, has_elevator: false, has_balcony: true, has_view: true, has_ac: true, price_per_sqm: 1357, latitude: 37.8166, longitude: 23.7949, suitable_investment: true },
    { ...B, owner_id: o.agentFree, listing_type: "sale", property_type: "commercial", city: "Glyfada", address: "35 Kyriazi St, Glyfada", title: "Commercial Floor 200m² — Glyfada High Street", description: "Prime 200m² commercial space on Glyfada main shopping street. Formerly gym — highly adaptable. High footfall.", price: 295000, sqm: 200, bedrooms: 0, bathrooms: 2, floor: 1, total_floors: 4, year_built: 1985, energy_class: null, heating_system: "autonomous_gas", has_parking: false, has_elevator: true, has_balcony: false, has_ac: true, price_per_sqm: 1475, latitude: 37.8688, longitude: 23.7532 },

    // FOR SALE - agent.pro (7 listings, premium)
    { ...B, owner_id: o.agentPro, listing_type: "sale", property_type: "apartment", city: "Athens", address: "4 Patriarchou Ioakeim St, Kolonaki, Athens", title: "Luxury Penthouse 180m² — Kolonaki, Acropolis View", description: "Exceptional top-floor penthouse in Kolonaki with direct Acropolis views from 60m² terrace. Bespoke kitchen, home automation.", price: 1450000, sqm: 180, bedrooms: 3, bathrooms: 3, floor: 9, total_floors: 9, year_built: 2020, energy_class: "A+", heating_system: "heat_pump", has_parking: true, has_elevator: true, has_balcony: true, has_view: true, has_ac: true, price_per_sqm: 8056, latitude: 37.9783, longitude: 23.7412, is_featured: true, priority_placement: 2 },
    { ...B, owner_id: o.agentPro, listing_type: "sale", property_type: "villa", city: "Vouliagmeni", address: "Odos Litous, Vouliagmeni", title: "Sea-Front Villa with Pool — Vouliagmeni", description: "Waterfront villa 320m² with direct sea access, infinity pool, private jetty. Designed by leading Athens architect.", price: 5800000, sqm: 320, bedrooms: 4, bathrooms: 4, floor: 0, total_floors: 2, year_built: 2019, energy_class: "A+", heating_system: "heat_pump", has_parking: true, has_elevator: true, has_balcony: true, has_view: true, has_ac: true, has_pool: true, has_garden: true, price_per_sqm: 18125, latitude: 37.8027, longitude: 23.7784, is_featured: true, priority_placement: 2 },
    { ...B, owner_id: o.agentPro, listing_type: "new_build", property_type: "apartment", city: "Chalandri", address: "28 Agiou Ioannou St, Chalandri", title: "New-Build Apartment 2BR — Chalandri, ENERGY A+", description: "Brand new 95m² apartment in boutique development of 12 units. Under-floor heating, PV-ready, EV charger. Ready Q4 2026.", price: 335000, sqm: 95, bedrooms: 2, bathrooms: 2, floor: 2, total_floors: 4, year_built: 2026, energy_class: "A+", heating_system: "heat_pump", has_parking: true, has_elevator: true, has_balcony: true, has_ac: true, price_per_sqm: 3526, latitude: 38.0205, longitude: 23.7990 },
    { ...B, owner_id: o.agentPro, listing_type: "new_build", property_type: "villa", city: "Glyfada", address: "Odos Zephyrou, Glyfada Private Estate", title: "New-Build Villa 4BR — Glyfada Sea-Glimpse", description: "Off-plan detached villa 290m² in gated community of 6 villas. Rooftop pool, smart home, EV 3-car garage. Delivery Q1 2027.", price: 1850000, sqm: 290, bedrooms: 4, bathrooms: 4, floor: 0, total_floors: 2, year_built: 2027, energy_class: "A+", heating_system: "heat_pump", has_parking: true, has_elevator: false, has_balcony: true, has_view: true, has_ac: true, has_pool: true, has_garden: true, price_per_sqm: 6379, latitude: 37.8654, longitude: 23.7522, is_featured: true, priority_placement: 1 },
    { ...B, owner_id: o.agentPro, listing_type: "sale", property_type: "maisonette", city: "Alimos", address: "Odos Poseidonos, Alimos Riviera", title: "Luxury Maisonette 3BR — Athens Riviera, Alimos", description: "Architecturally designed split-level maisonette 165m². Master with en suite sea-view terrace. Communal gym and pool.", price: 720000, sqm: 165, bedrooms: 3, bathrooms: 3, floor: 1, total_floors: 3, year_built: 2023, energy_class: "A+", heating_system: "heat_pump", has_parking: true, has_elevator: true, has_balcony: true, has_view: true, has_ac: true, has_pool: true, price_per_sqm: 4364, latitude: 37.9080, longitude: 23.7120, is_featured: true, priority_placement: 1 },
    { ...B, owner_id: o.agentPro, listing_type: "sale", property_type: "mixed_use", city: "Piraeus", address: "Corner Miaouli & Filonos, Piraeus", title: "Mixed-Use 4-Storey Building — Piraeus Central", description: "Four-storey 640m² corner mixed-use. Ground floor bank lease EUR 3,400/mo + 3 upper residential floors fully rented. Yield 5.7%.", price: 720000, sqm: 640, bedrooms: 6, bathrooms: 6, floor: 0, total_floors: 4, year_built: 1968, energy_class: "E", heating_system: "central_gas", has_parking: false, has_elevator: true, has_balcony: false, has_ac: true, price_per_sqm: 1125, latitude: 37.9457, longitude: 23.6445, suitable_investment: true },
    { ...B, owner_id: o.agentPro, listing_type: "sale", property_type: "hotel", city: "Santorini", address: "Odos Perissas, Perissa, Santorini", title: "Boutique Hotel — Santorini, 14 Suites, Pool", description: "Operating cave-style hotel 14 suites in Perissa with pool. Occupancy 82% in 2025. Full business incl. licenses and staff.", price: 3200000, sqm: 540, bedrooms: 14, bathrooms: 14, floor: 0, total_floors: 2, year_built: 2004, energy_class: "D", heating_system: "heat_pump", has_parking: true, has_elevator: false, has_balcony: true, has_view: true, has_ac: true, has_pool: true, price_per_sqm: 5926, latitude: 36.3496, longitude: 25.4780, is_featured: true, priority_placement: 2, suitable_investment: true },

    // FOR RENT - seller.free (3 listings)
    { ...B, owner_id: o.sellerFree, listing_type: "rent", property_type: "apartment", city: "Athens", address: "15 Plastira St, Pagrati, Athens", title: "2BR Apartment for Rent — Pagrati, Athens", description: "Well-kept 78m² apartment on 2nd floor in Pagrati. Two bedrooms, renovated kitchen. Gas heating, A/C, double glazing.", price: 850, sqm: 78, bedrooms: 2, bathrooms: 1, floor: 2, total_floors: 5, year_built: 1980, energy_class: "C", heating_system: "autonomous_gas", has_parking: false, has_elevator: true, has_balcony: true, has_ac: true, price_per_sqm: 11, latitude: 37.9700, longitude: 23.7480 },
    { ...B, owner_id: o.sellerFree, listing_type: "rent", property_type: "studio", city: "Athens", address: "3 Agias Irinis Square, Monastiraki, Athens", title: "Furnished Studio for Rent — Monastiraki", description: "Fully furnished 42m² studio, ground floor. New fridge, washing machine, fibre internet. Short and long stays welcome.", price: 680, sqm: 42, bedrooms: 1, bathrooms: 1, floor: 0, total_floors: 4, year_built: 1972, energy_class: "E", heating_system: "autonomous_gas", has_parking: false, has_elevator: false, has_balcony: false, has_ac: true, has_furnished: true, price_per_sqm: 16, latitude: 37.9762, longitude: 23.7245 },
    { ...B, owner_id: o.sellerFree, listing_type: "rent", property_type: "commercial", city: "Thessaloniki", address: "7 Aristotelous Square, Thessaloniki", title: "Commercial Shop for Rent — Thessaloniki Aristotelous", description: "Ground-floor retail 85m² on Aristotelous Square — prime Thessaloniki address. 4m ceiling, two WC, storage.", price: 1100, sqm: 85, bedrooms: 0, bathrooms: 2, floor: 0, total_floors: 4, year_built: 1958, energy_class: null, heating_system: "central_gas", has_parking: false, has_elevator: false, has_balcony: false, has_ac: true, price_per_sqm: 13, latitude: 40.6355, longitude: 22.9377 },

    // FOR RENT - seller.pro (2 listings)
    { ...B, owner_id: o.sellerPro, listing_type: "rent", property_type: "maisonette", city: "Voula", address: "22 Alkyonidon St, Voula", title: "3BR Maisonette for Rent — Voula, Athens Riviera", description: "Spacious 145m² maisonette across two floors in Voula. Three bedrooms, private garden, covered parking. 6-month minimum.", price: 1600, sqm: 145, bedrooms: 3, bathrooms: 2, floor: 1, total_floors: 2, year_built: 1997, energy_class: "C", heating_system: "autonomous_gas", has_parking: true, has_elevator: false, has_balcony: true, has_garden: true, has_ac: true, price_per_sqm: 11, latitude: 37.8427, longitude: 23.7728 },
    { ...B, owner_id: o.sellerPro, listing_type: "rent", property_type: "office", city: "Piraeus", address: "52 Akti Miaouli, Piraeus", title: "Office Floor for Rent — Piraeus, 180m²", description: "Entire office floor 180m² in modern building, central Piraeus. Open plan + 3 enclosed offices, kitchen, 2 parking.", price: 1400, sqm: 180, bedrooms: 0, bathrooms: 2, floor: 3, total_floors: 6, year_built: 2008, energy_class: "B", heating_system: "central_gas", has_parking: true, has_elevator: true, has_balcony: false, has_view: true, has_ac: true, price_per_sqm: 8, latitude: 37.9475, longitude: 23.6423 },

    // FOR RENT - agent.free (4 listings)
    { ...B, owner_id: o.agentFree, listing_type: "rent", property_type: "apartment", city: "Marousi", address: "9 Agiou Konstantinou St, Marousi", title: "Modern 1BR Apartment for Rent — Marousi Metro", description: "Contemporary 55m² apartment 6th floor, 200m from Marousi metro. Renovated 2023, new appliances, balcony.", price: 780, sqm: 55, bedrooms: 1, bathrooms: 1, floor: 6, total_floors: 8, year_built: 1991, energy_class: "C", heating_system: "autonomous_gas", has_parking: false, has_elevator: true, has_balcony: true, has_ac: true, price_per_sqm: 14, latitude: 38.0548, longitude: 23.8082 },
    { ...B, owner_id: o.agentFree, listing_type: "rent", property_type: "commercial", city: "Glyfada", address: "48 Kyriazi St, Glyfada", title: "Retail Unit for Rent — Glyfada High Street", description: "Ground-floor retail 90m² on Glyfada commercial strip. Bare-shell ready for fit-out. 6m display window frontage.", price: 1150, sqm: 90, bedrooms: 0, bathrooms: 1, floor: 0, total_floors: 3, year_built: 1983, energy_class: null, heating_system: "autonomous_gas", has_parking: false, has_elevator: false, has_balcony: false, has_ac: true, price_per_sqm: 13, latitude: 37.8692, longitude: 23.7528 },
    { ...B, owner_id: o.agentFree, listing_type: "rent", property_type: "house", city: "Kifisia", address: "6 Drosinis St, Kifisia", title: "4BR Family House for Rent — Kifisia", description: "Spacious 200m² detached house in Kifisia. Four bedrooms, study, private garden, double garage. 10-min to ISAP.", price: 2200, sqm: 200, bedrooms: 4, bathrooms: 3, floor: 0, total_floors: 2, year_built: 2002, energy_class: "B", heating_system: "autonomous_gas", has_parking: true, has_elevator: false, has_balcony: true, has_garden: true, has_ac: true, price_per_sqm: 11, latitude: 38.0734, longitude: 23.8102 },
    { ...B, owner_id: o.agentFree, listing_type: "rent", property_type: "office", city: "Athens", address: "10 Stadiou St, Athens", title: "Office Suite for Rent — Athens City Centre, 120m²", description: "Ready office suite 120m² on 4th floor, Syntagma area. Four enclosed offices, boardroom, kitchen, 2 parking bays.", price: 1650, sqm: 120, bedrooms: 0, bathrooms: 2, floor: 4, total_floors: 6, year_built: 2010, energy_class: "A", heating_system: "central_gas", has_parking: true, has_elevator: true, has_balcony: false, has_ac: true, price_per_sqm: 14, latitude: 37.9754, longitude: 23.7351 },

    // FOR RENT - agent.pro (1 listing)
    { ...B, owner_id: o.agentPro, listing_type: "rent", property_type: "apartment", city: "Athens", address: "31 Kanari St, Kolonaki, Athens", title: "Furnished 2BR Apartment for Rent — Kolonaki", description: "Elegantly furnished 95m² apartment in prime Kolonaki, 4th floor with city views. Designer furniture, high-end appliances.", price: 1500, sqm: 95, bedrooms: 2, bathrooms: 2, floor: 4, total_floors: 7, year_built: 2001, energy_class: "B", heating_system: "central_gas", has_parking: true, has_elevator: true, has_balcony: true, has_view: true, has_ac: true, has_furnished: true, price_per_sqm: 16, latitude: 37.9797, longitude: 23.7408 },

    // OPEN HOUSE - seller.free (1), seller.pro (2)
    { ...B, owner_id: o.sellerFree, listing_type: "open_house", property_type: "apartment", city: "Athens", address: "33 Effonos St, Pagrati, Athens", title: "Open House — 3BR Apartment, Pagrati Athens", description: "Join our open house viewing! 90m² apartment 3rd floor with renovated kitchen and bathroom. Owner present. All welcome.", price: 198000, sqm: 90, bedrooms: 3, bathrooms: 1, floor: 3, total_floors: 6, year_built: 1984, energy_class: "C", heating_system: "autonomous_gas", has_parking: false, has_elevator: true, has_balcony: true, has_ac: true, price_per_sqm: 2200, latitude: 37.9685, longitude: 23.7497, open_house_date: daysFromNow(14) },
    { ...B, owner_id: o.sellerPro, listing_type: "open_house", property_type: "villa", city: "Glyfada", address: "34 Poseidonos Ave, Glyfada", title: "Open House Weekend — Villa with Pool, Glyfada", description: "Weekend open house for 4BR villa 240m² with private pool and garden. Saturday & Sunday 10:00-14:00. Refreshments provided.", price: 1100000, sqm: 240, bedrooms: 4, bathrooms: 3, floor: 0, total_floors: 2, year_built: 2012, energy_class: "A", heating_system: "heat_pump", has_parking: true, has_elevator: false, has_balcony: true, has_view: true, has_ac: true, has_pool: true, has_garden: true, price_per_sqm: 4583, latitude: 37.8642, longitude: 23.7504, open_house_date: daysFromNow(10), is_featured: true, priority_placement: 1 },
    { ...B, owner_id: o.sellerPro, listing_type: "open_house", property_type: "maisonette", city: "Thessaloniki", address: "16 Analipseos St, Panorama, Thessaloniki", title: "Open House — Maisonette 4BR, Thessaloniki Panorama", description: "Visit our panorama maisonette this Sunday! Four bedrooms, stunning city views. Walk-ins welcome. Seller available on site.", price: 365000, sqm: 180, bedrooms: 4, bathrooms: 2, floor: 1, total_floors: 2, year_built: 2000, energy_class: "C", heating_system: "autonomous_gas", has_parking: true, has_elevator: false, has_balcony: true, has_view: true, has_ac: true, has_garden: true, price_per_sqm: 2028, latitude: 40.6218, longitude: 22.9870, open_house_date: daysFromNow(7) },

    // OPEN HOUSE - agent.pro (1), agent.free (2)
    { ...B, owner_id: o.agentPro, listing_type: "open_house", property_type: "apartment", city: "Chalandri", address: "28 Agiou Ioannou St, Chalandri", title: "Open House — New-Build Apartment, Chalandri", description: "Preview our new-build development. Energy A+, smart home, EV charging. Three apartments still available. Saturday 10:00-13:00.", price: 335000, sqm: 95, bedrooms: 2, bathrooms: 2, floor: 2, total_floors: 4, year_built: 2026, energy_class: "A+", heating_system: "heat_pump", has_parking: true, has_elevator: true, has_balcony: true, has_ac: true, price_per_sqm: 3526, latitude: 38.0205, longitude: 23.7990, open_house_date: daysFromNow(17) },
    { ...B, owner_id: o.agentFree, listing_type: "open_house", property_type: "apartment", city: "Thessaloniki", address: "20 Egnatia St, Thessaloniki", title: "Open House — 2BR Apartment, Thessaloniki", description: "Saturday open viewing for well-maintained 2BR apartment, central Thessaloniki. Renovated 2021. Walk-ins 11:00-15:00.", price: 145000, sqm: 88, bedrooms: 2, bathrooms: 1, floor: 4, total_floors: 5, year_built: 1980, energy_class: "D", heating_system: "autonomous_gas", has_parking: false, has_elevator: true, has_balcony: true, has_ac: true, price_per_sqm: 1648, latitude: 40.6373, longitude: 22.9472, open_house_date: daysFromNow(21) },
    { ...B, owner_id: o.agentFree, listing_type: "open_house", property_type: "office", city: "Marousi", address: "68 Kifissias Ave, Marousi", title: "Open House — Office Space 150m², Marousi", description: "See this ready-to-use office floor in Marousi. 3 enclosed offices, open workspace, kitchen, 2 parking bays. Sunday 10:00-13:00.", price: 285000, sqm: 150, bedrooms: 0, bathrooms: 2, floor: 3, total_floors: 6, year_built: 2012, energy_class: "A", heating_system: "central_gas", has_parking: true, has_elevator: true, has_balcony: false, has_ac: true, price_per_sqm: 1900, latitude: 38.0565, longitude: 23.8075, open_house_date: daysFromNow(8) },
  ];
}
// ---- PROFESSIONALS ----------------------------------------------------------
type ProfRow = Record<string, unknown>;

function makeProfessionals(o: Owners): ProfRow[] {
  const B = { avatar_url: null, rating: 0, reviews_count: 0, verified: false };
  return [
    { ...B, user_id: o.architectFree, display_name: "Stavros Petrakis", title: "Licensed Architect", category: "architect", city: "Athens", bio: "Practising architect with 12 years of experience in residential and commercial projects across Attica. Member of the Technical Chamber of Greece. Specialises in building permits and renovation feasibility.", specialties: ["Residential Design", "Renovation", "Building Permits"], languages: ["Greek", "English"], experience_years: 12, rating: 4.3, reviews_count: 18, hourly_rate: 80, projects_count: 44, verified: true, subscription_tier: "free", license_number: "ATE-2014-082431" },
    { ...B, user_id: o.architectPro, display_name: "Alexandra Nikolaou", title: "Senior Architect — Sustainable Design", category: "architect", city: "Thessaloniki", bio: "Award-winning architect in Thessaloniki specialising in energy-efficient and bioclimatic design. 20+ years of practice. LEED AP certified.", specialties: ["Sustainable Design", "Bioclimatic Architecture", "New Build", "Heritage Renovation"], languages: ["Greek", "English", "German"], experience_years: 20, rating: 4.9, reviews_count: 61, hourly_rate: 135, projects_count: 87, verified: true, subscription_tier: "pro", license_number: "ATE-2004-033210", website_url: "https://anarchitecture.gr" },
    { ...B, user_id: o.engineerFree, display_name: "Giorgos Manolas", title: "Civil & Structural Engineer", category: "civil_engineer", city: "Athens", bio: "Civil engineer specialising in structural inspections, seismic assessments, and pre-purchase surveys. 15 years of field experience.", specialties: ["Structural Inspection", "Seismic Assessment", "Pre-Purchase Surveys"], languages: ["Greek", "English"], experience_years: 15, rating: 4.5, reviews_count: 29, hourly_rate: 90, projects_count: 112, verified: true, subscription_tier: "free", license_number: "PM-2009-112870" },
    { ...B, user_id: o.engineerPro, display_name: "Eleftheria Papadaki", title: "Senior Civil Engineer — Seismic Specialist", category: "civil_engineer", city: "Heraklion", bio: "Expert in seismic vulnerability assessment, post-earthquake damage reports, and building retrofit design. Authorised by Greek Ministry of Infrastructure.", specialties: ["Seismic Engineering", "Retrofit Design", "Damage Assessment"], languages: ["Greek", "English", "Italian"], experience_years: 22, rating: 4.8, reviews_count: 47, hourly_rate: 120, projects_count: 155, verified: true, subscription_tier: "pro", license_number: "PM-2002-045612", website_url: "https://papadaki-engineers.gr" },
    { ...B, user_id: o.lawyerFree, display_name: "Nikos Andreou", title: "Real Estate Lawyer", category: "lawyer", city: "Athens", bio: "Athens Bar lawyer focused on residential and commercial property transactions. Handles title searches, due diligence, sale contracts, and mortgage documentation.", specialties: ["Property Transactions", "Title Search", "Contracts", "Foreign Buyers"], languages: ["Greek", "English"], experience_years: 10, rating: 4.4, reviews_count: 33, hourly_rate: 150, projects_count: 200, verified: true, subscription_tier: "free", license_number: "DSA-2014-28741" },
    { ...B, user_id: o.lawyerPro, display_name: "Charalambos Dimas", title: "Senior Real Estate & Investment Lawyer", category: "lawyer", city: "Athens", bio: "Partner at Dimas & Partners with 18 years in high-value property transactions, commercial real estate, Golden Visa investments, and cross-border acquisitions.", specialties: ["Golden Visa", "Commercial Real Estate", "Cross-Border Acquisitions", "Investment Law"], languages: ["Greek", "English", "French", "German"], experience_years: 18, rating: 4.9, reviews_count: 88, hourly_rate: 250, projects_count: 420, verified: true, subscription_tier: "pro", license_number: "DSA-2006-14892", website_url: "https://dimaslaw.gr" },
    { ...B, user_id: o.notaryFree, display_name: "Maria Theodorakis", title: "Notary Public — Athens", category: "notary", city: "Athens", bio: "Notary in Athens area practising real estate deeds, inheritance, and company formations. Handles electronic notarial acts.", specialties: ["Property Deeds", "Inheritance", "Company Formation"], languages: ["Greek", "English"], experience_years: 9, rating: 4.2, reviews_count: 24, projects_count: 180, verified: true, subscription_tier: "free", license_number: "SAN-2015-00412" },
    { ...B, user_id: o.notaryPro, display_name: "Apostolos Georgiou", title: "Senior Notary Public", category: "notary", city: "Thessaloniki", bio: "High-volume notary with 25 years in Thessaloniki. All property-related notarial work including complex multi-party transactions and overseas client POA.", specialties: ["Multi-Party Transactions", "Auction Deeds", "Power of Attorney"], languages: ["Greek", "English", "Bulgarian"], experience_years: 25, rating: 4.8, reviews_count: 142, projects_count: 950, verified: true, subscription_tier: "pro", license_number: "STN-1999-00087", website_url: "https://georgiou-notary.gr" },
    { ...B, user_id: o.managerFree, display_name: "Tasos Alexandris", title: "Property Manager", category: "property_manager", city: "Heraklion", bio: "Property manager in Heraklion managing long-term rentals. Services include tenant screening, maintenance coordination, and monthly reporting.", specialties: ["Long-Term Rentals", "Tenant Management", "Maintenance Coordination"], languages: ["Greek", "English"], experience_years: 7, rating: 4.1, reviews_count: 14, hourly_rate: 50, projects_count: 18, subscription_tier: "free" },
    { ...B, user_id: o.managerPro, display_name: "Katerina Hatzidimitriou", title: "Property Portfolio Manager", category: "property_manager", city: "Kifisia", bio: "Managing director of PropManage Athens with 80+ residential and commercial units. Specialises in HNW property management, Airbnb optimisation, and corporate relocation.", specialties: ["Portfolio Management", "Short-Term Rental", "Corporate Relocation", "HNW Clients"], languages: ["Greek", "English", "French"], experience_years: 14, rating: 4.8, reviews_count: 67, hourly_rate: 85, projects_count: 82, verified: true, subscription_tier: "pro", website_url: "https://propmanageathens.gr" },
    { ...B, user_id: o.advisorPro, display_name: "Petros Katsaros", title: "Mortgage & Property Investment Advisor", category: "financial_advisor", city: "Athens", bio: "Authorised financial advisor with 16 years in mortgage structuring, property investment analysis, and buy-to-let portfolio planning. Independent — no bank affiliation.", specialties: ["Mortgage Advice", "Buy-to-Let", "Investment Analysis", "Golden Visa Financing"], languages: ["Greek", "English"], experience_years: 16, rating: 4.7, reviews_count: 55, hourly_rate: 120, projects_count: 310, verified: true, subscription_tier: "pro", website_url: "https://katsarosfinancial.gr" },
    { ...B, user_id: o.valuerPro, display_name: "Irini Zervou", title: "Chartered Property Valuer — RICS Associate", category: "valuer", city: "Athens", bio: "RICS Associate conducting residential and commercial valuations across Greece. Accepted by all major Greek banks for mortgage purposes. 48h urgent turnaround available.", specialties: ["Residential Valuation", "Commercial Valuation", "Mortgage Valuations"], languages: ["Greek", "English"], experience_years: 11, rating: 4.9, reviews_count: 102, hourly_rate: 160, projects_count: 480, verified: true, subscription_tier: "pro", website_url: "https://zervourealestate.gr" },
  ];
}

async function seedProfessionalServices(profs: ProfRow[]): Promise<void> {
  // professional_services columns: professional_id, service_key, service_name,
  // description, category, pricing_model, rate_amount, currency, estimated_hours,
  // is_active, video_enabled, is_premium
  const SERVICES: Record<string, { service_key: string; service_name: string; description: string; category: string; pricing_model: string; rate_amount: number | null; estimated_hours: number | null; is_premium: boolean }[]> = {
    architect: [
      { service_key: "initial_consult", service_name: "Initial Consultation", description: "60-minute site visit or video call to assess your project.", category: "architect", pricing_model: "fixed", rate_amount: 80, estimated_hours: 1, is_premium: false },
      { service_key: "building_permit", service_name: "Building Permit Application", description: "Full preparation and submission of building permit documentation.", category: "architect", pricing_model: "fixed", rate_amount: 2500, estimated_hours: null, is_premium: false },
    ],
    civil_engineer: [
      { service_key: "structural_inspection", service_name: "Structural Inspection Report", description: "On-site inspection and written structural safety report.", category: "civil_engineer", pricing_model: "fixed", rate_amount: 350, estimated_hours: 2, is_premium: false },
      { service_key: "seismic_assessment", service_name: "Seismic Assessment", description: "Full seismic vulnerability assessment with remediation recommendations.", category: "civil_engineer", pricing_model: "fixed", rate_amount: 900, estimated_hours: null, is_premium: true },
    ],
    lawyer: [
      { service_key: "title_search", service_name: "Title Search", description: "Comprehensive land registry and encumbrance check for a property.", category: "lawyer", pricing_model: "fixed", rate_amount: 200, estimated_hours: null, is_premium: false },
      { service_key: "contract_review", service_name: "Sale Contract Review", description: "Review and negotiation of preliminary and final sale agreement.", category: "lawyer", pricing_model: "fixed", rate_amount: 600, estimated_hours: null, is_premium: false },
    ],
    notary: [
      { service_key: "deed_preparation", service_name: "Deed of Sale Preparation", description: "Notarial deed preparation and signature coordination.", category: "notary", pricing_model: "percentage", rate_amount: null, estimated_hours: null, is_premium: false },
    ],
    property_manager: [
      { service_key: "monthly_management", service_name: "Property Management — Monthly", description: "Full tenancy management including maintenance, rent collection, and reporting.", category: "property_manager", pricing_model: "fixed", rate_amount: 120, estimated_hours: null, is_premium: false },
      { service_key: "tenant_screening", service_name: "Tenant Screening", description: "Background and credit check for prospective tenants.", category: "property_manager", pricing_model: "fixed", rate_amount: 75, estimated_hours: null, is_premium: false },
    ],
    financial_advisor: [
      { service_key: "mortgage_consult", service_name: "Mortgage Consultation", description: "One-hour session comparing available mortgage products and structuring options.", category: "financial_advisor", pricing_model: "hourly", rate_amount: 120, estimated_hours: 1, is_premium: false },
      { service_key: "investment_report", service_name: "Investment Feasibility Report", description: "Full ROI and cash flow analysis for a buy-to-let property.", category: "financial_advisor", pricing_model: "fixed", rate_amount: 450, estimated_hours: null, is_premium: true },
    ],
    valuer: [
      { service_key: "residential_valuation", service_name: "Residential Valuation Report", description: "RICS-aligned valuation report accepted by all major banks.", category: "valuer", pricing_model: "fixed", rate_amount: 350, estimated_hours: null, is_premium: false },
      { service_key: "commercial_valuation", service_name: "Commercial Valuation Report", description: "Detailed commercial property valuation including yield analysis.", category: "valuer", pricing_model: "fixed", rate_amount: 750, estimated_hours: null, is_premium: true },
    ],
  };

  for (const prof of profs) {
    const cat = prof.category as string;
    const svcs = SERVICES[cat];
    if (!svcs?.length) continue;
    const { data: row } = await supabase.from("professionals").select("id").eq("user_id", prof.user_id).maybeSingle();
    if (!row?.id) continue;
    const { error } = await supabase.from("professional_services").insert(svcs.map(s => ({ ...s, professional_id: row.id })));
    if (error) console.error("  service insert error (" + (prof.display_name as string) + "):", error.message);
  }
}

// ---- MAIN -------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("\nseed-production-listings.ts — maiProp production data refresh");
  console.log("=".repeat(60));

  console.log("\nResolving demo account IDs...");
  let owners: Owners;
  try {
    owners = await resolveOwners();
    console.log("  ok - all accounts resolved");
  } catch (err: unknown) {
    console.error("  FAILED:", err instanceof Error ? err.message : err);
    process.exit(1);
  }

  await wipe();

  const listings = makeListings(owners);
  console.log("\nInserting " + listings.length + " listings...");
  const BATCH = 15;
  let inserted = 0;
  for (let i = 0; i < listings.length; i += BATCH) {
    const batch = listings.slice(i, i + BATCH);
    const { error } = await supabase.from("listings").insert(batch);
    if (error) {
      console.error("  BATCH " + (Math.floor(i / BATCH) + 1) + " ERROR:", error.message);
      const bad = batch.find(l => !l.property_type || !l.listing_type || !l.owner_id);
      if (bad) console.error("  Bad row:", JSON.stringify(bad).slice(0, 200));
    } else {
      inserted += batch.length;
      console.log("  ok - batch " + (Math.floor(i / BATCH) + 1) + ": " + batch.length + " inserted");
    }
  }
  console.log("  Total: " + inserted + "/" + listings.length);

  const profs = makeProfessionals(owners);
  console.log("\nInserting " + profs.length + " professionals...");
  const { error: profErr } = await supabase.from("professionals").insert(profs);
  if (profErr) {
    console.error("  ERROR:", profErr.message);
  } else {
    console.log("  ok - " + profs.length + " professionals inserted");
    await seedProfessionalServices(profs);
    console.log("  ok - professional services seeded");
  }

  console.log("\n" + "=".repeat(60));
  console.log("Seed complete!");

  const byType: Record<string, number> = {};
  const byPropType: Record<string, number> = {};
  const byOwner: Record<string, number> = {};
  for (const l of listings) {
    const lt = l.listing_type as string;
    const pt = l.property_type as string;
    const ow = Object.entries(owners).find(([, v]) => v === l.owner_id)?.[0] ?? "?";
    byType[lt] = (byType[lt] ?? 0) + 1;
    byPropType[pt] = (byPropType[pt] ?? 0) + 1;
    byOwner[ow] = (byOwner[ow] ?? 0) + 1;
  }
  console.log("Listing types:", JSON.stringify(byType));
  console.log("Property types:", JSON.stringify(byPropType));
  console.log("Owner breakdown:", JSON.stringify(byOwner));
}

main().catch((err: unknown) => {
  console.error("Fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
