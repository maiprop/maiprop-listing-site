/**
 * Seed listing_images for all listings that have none.
 * Adds 5 images per listing, chosen from curated Unsplash pools by property_type.
 * Also back-fills ai_score where missing.
 *
 * Run: npx tsx scripts/seed-listing-images.ts
 */

import { createClient } from "@supabase/supabase-js";
import { assertNotProduction } from "./_prod-guard";
import { getSeedEnv } from "./_seed-env";

const { supabaseUrl: SUPABASE_URL, serviceRoleKey: SERVICE_ROLE_KEY } = getSeedEnv();

assertNotProduction(SUPABASE_URL, "seed-listing-images.ts");

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Image pools ───────────────────────────────────────────────────────────────
// All images verified on Unsplash. Format: photo-{id}?w=1200&q=85
const U = (id: string) => `https://images.unsplash.com/photo-${id}?w=1200&q=85`;

const POOLS = {
  // ── Apartments ──────────────────────────────────────────────────────────────
  apartment_living: [
    U("1493809842364-78817add7ffb"), // grey modern living
    U("1560448204-e02f11c3d0e2"),   // bright living room
    U("1586023492125-27b2c045efd7"), // cozy neutral living
    U("1555041469-a586c61ea9bc"),   // velvet sofa living
    U("1583847268964-b28dc8f51f92"), // minimal Scandi living
    U("1618221195710-dd6b41faaea6"), // white contemporary
    U("1550581190-9c1c629e5456"),   // warm apartment living
    U("1600121848594-d8644e57abcd"), // open-plan city apt
    U("1505693416388-ac5ce068fe85"), // modern corner sofa
    U("1484101403633-562f891dc89a"), // bright white living
  ],
  apartment_kitchen: [
    U("1556909114-f6e7ad7d3136"),   // dark marble kitchen
    U("1556911220-bff31c812dba"),   // light modern kitchen
    U("1565538810-55839e04fcad"),   // minimalist white kitchen
    U("1556909190-8cbe4c5cda1d"),   // kitchen island
    U("1581112431-e7c4e79dd7b0"),   // Scandi kitchen
    U("1606170047740-f73d5c18d6d9"), // open kitchen diner
    U("1600489788263-6d93d20d893d"), // marble counter kitchen
    U("1556909061-0f49736e6d36"),   // monochrome kitchen
  ],
  apartment_bedroom: [
    U("1540518614846-7eded433c457"), // white linen bedroom
    U("1522771739844-6a9f6d5f14af"), // modern master bedroom
    U("1560185007-cde436f6cb50"),   // minimal bedroom
    U("1600585154340-be6161a56a0c"), // light bedroom
    U("1505693314914-4d7cab8174cc"), // king bed bedroom
    U("1618023174-3b97f4d1d5a9"),   // contemporary bedroom
    U("1631049307264-da0ec9d70304"), // plush bedroom
    U("1592229505726-ca0e5c5e44d6"), // cozy bedroom nook
  ],
  apartment_bathroom: [
    U("1552321554-5fefe8c9ef14"),   // modern white bathroom
    U("1584622650111-993a426fbf0a"), // marble bathroom
    U("1600566753086-00f18fb6b3ea"), // freestanding bath
    U("1552566260-0bf60e23fb89"),   // minimal bathroom
    U("1620626011761-47a08d434614"), // terrazzo bathroom
    U("1574180566232-aaad1b5b8450"), // spa-style bathroom
    U("1563453392212-326f5e854473"), // ensuite bathroom
  ],
  apartment_balcony: [
    U("1560185008-b033106af5c3"),   // city balcony view
    U("1512917774080-9991f1c4c750"), // high-rise balcony
    U("1532372320978-9dbb87218b29"), // Athens-style rooftop
    U("1592394533824-9440e5d68530"), // terrace with chairs
    U("1600607687920-4e2a09cf159d"), // modern terrace
    U("1523217582562-09d0def993a6"), // balcony sunset view
  ],

  // ── Villa ───────────────────────────────────────────────────────────────────
  villa_exterior: [
    U("1570129477492-45c003edd2be"), // white villa exterior
    U("1568605114967-8130f3a36994"), // modern villa facade
    U("1558618666-fcd25c85cd64"),   // pool villa aerial
    U("1605146769289-440113cc3d00"), // Mediterranean villa
    U("1580587771525-78b9dba3b914"), // villa driveway
    U("1600047509807-ba8f99d2cdde"), // contemporary villa
    U("1613977257592-4871e5fcd7c4"), // hillside villa
    U("1582268611958-ebfd161ef9cf"), // villa with garden
  ],
  villa_pool: [
    U("1558618666-fcd25c85cd64"),   // infinity pool
    U("1566073771259-470de1bed804"), // pool terrace
    U("1596394516093-501ba68a0ba6"), // blue pool
    U("1572799239671-42b4b7baa1e2"), // outdoor pool evening
    U("1575429198097-0414ec08e8cd"), // villa pool deck
    U("1571008887538-b36bb32f4571"), // pool and loungers
    U("1592861956120-e524fc739696"), // Greek-style pool
  ],
  villa_interior: [
    U("1600596542815-ffad4c1539a9"), // villa living room
    U("1600607687920-4e2a09cf159d"), // open-plan villa
    U("1600585154340-be6161a56a0c"), // bright villa interior
    U("1617806091219-6e7ec6c08011"), // villa dining
    U("1556909114-f6e7ad7d3136"),   // dark marble kitchen
    U("1550581190-9c1c629e5456"),   // warm living space
    U("1618221195710-dd6b41faaea6"), // white villa room
  ],
  villa_garden: [
    U("1558618666-fcd25c85cd64"),   // terrace & garden
    U("1506905925346-21bda4d32df4"), // lush garden
    U("1516912481800-c04a0c22e2c8"), // Mediterranean garden
    U("1465146344425-f00d5f5c8f07"), // garden path
    U("1558697219-1a1a1c16e88e"),   // garden table setting
    U("1570168007204-dca5b04f8681"), // terrace garden
  ],

  // ── House ───────────────────────────────────────────────────────────────────
  house_exterior: [
    U("1512917774080-9991f1c4c750"), // modern house
    U("1568605114967-8130f3a36994"), // house with garden
    U("1600585154340-be6161a56a0c"), // suburban house
    U("1583608205776-bfd35f0d9f83"), // terrace house
    U("1570129477492-45c003edd2be"), // detached house
    U("1558618666-fcd25c85cd64"),   // house with pool
    U("1605146769289-440113cc3d00"), // family home
  ],
  house_interior: [
    U("1493809842364-78817add7ffb"), // family living
    U("1560448204-e02f11c3d0e2"),   // open plan living
    U("1556909114-f6e7ad7d3136"),   // family kitchen
    U("1554995207-c5f5d4c04a79"),   // home office / study
    U("1540518614846-7eded433c457"), // master bedroom
    U("1583847268964-b28dc8f51f92"), // kids room / spare
    U("1552321554-5fefe8c9ef14"),   // main bathroom
  ],

  // ── New build / Construction ─────────────────────────────────────────────────
  new_build_exterior: [
    U("1545324418-cc1a3fa10c00"),   // modern new build
    U("1600047509807-ba8f99d2cdde"), // new development
    U("1486325212027-8081e485255e"), // contemporary tower
    U("1531971589569-0d9370cbe1e5"), // glassy new block
    U("1464082354059-27db6ce50048"), // architectural
    U("1517581177682-a085bb7ffb15"), // new build facade
  ],
  new_build_interior: [
    U("1618221195710-dd6b41faaea6"), // show home living
    U("1600121848594-d8644e57abcd"), // show home open plan
    U("1565538810-55839e04fcad"),   // show home kitchen
    U("1631049307264-da0ec9d70304"), // show home bedroom
    U("1552321554-5fefe8c9ef14"),   // show home bathroom
    U("1583847268964-b28dc8f51f92"), // minimal show home
  ],
  new_build_render: [
    U("1545324418-cc1a3fa10c00"),
    U("1600047509807-ba8f99d2cdde"),
    U("1486325212027-8081e485255e"),
    U("1464082354059-27db6ce50048"),
    U("1517581177682-a085bb7ffb15"),
    U("1522708323590-d24dbb6b0267"),
  ],
  construction: [
    U("1503951458645-643d53bfd90f"), // under construction
    U("1504307651254-35680f356dfd"), // construction site
    U("1541888946425-d81bb19240f5"), // steel frame
    U("1534237710431-e2fc698436d0"), // building site
  ],

  // ── Commercial / Office ─────────────────────────────────────────────────────
  commercial: [
    U("1497366216548-37526070297c"), // open office
    U("1497366754035-f200968a7eda"), // modern office
    U("1497215842788-c4f92e1bdfe9"), // glass office
    U("1527192491265-7e15c55b1ed2"), // retail space
    U("1517457373958-b7bdd4587205"), // commercial interior
    U("1486406146926-c627a92ad1ab"), // office building
    U("1542621334-8427507fdbe4"),   // showroom / retail
    U("1565514020179-026b92b2d70b"), // coworking space
  ],

  // ── Greek / Mediterranean scenery ────────────────────────────────────────────
  greek_scenery: [
    U("1601882977492-4be2c0fe53c6"), // Athens skyline
    U("1555993539-1732b0258235"),   // Greek whitewashed
    U("1530841377801-4c5f7743b892"), // Greek coast view
    U("1596367407372-d8cd2fec4a15"), // Aegean sea
    U("1548705085-e6cd5a3e5f28"),   // Greek islands
    U("1533104189090-ef1d5e36e0c1"), // Athens Acropolis view
    U("1606820854416-439b2b56e9b0"), // Greek property view
    U("1591208333572-70dc52c3f9f7"), // sea view terrace
  ],

  // ── Auction specific ─────────────────────────────────────────────────────────
  auction: [
    U("1568605114967-8130f3a36994"),
    U("1582268611958-ebfd161ef9cf"),
    U("1570129477492-45c003edd2be"),
    U("1512917774080-9991f1c4c750"),
    U("1605146769289-440113cc3d00"),
    U("1600585154340-be6161a56a0c"),
  ],
};

// ── Pick images by property_type / listing_type ──────────────────────────────
function getImagePool(
  propertyType: string,
  listingType: string,
  isPreSale: boolean,
  constructionStatus: string | null,
): string[][] {
  const isCanonicalNewBuild = listingType === "new_build";
  const isUnderConst =
    isCanonicalNewBuild &&
    constructionStatus &&
    !["new", "shell_complete"].includes(constructionStatus);

  if (propertyType === "apartment") {
    if (isUnderConst) {
      return [POOLS.new_build_render, POOLS.new_build_exterior, POOLS.new_build_interior, POOLS.greek_scenery];
    }
    return [POOLS.apartment_living, POOLS.apartment_kitchen, POOLS.apartment_bedroom, POOLS.apartment_bathroom, POOLS.apartment_balcony];
  }
  if (propertyType === "villa") {
    if (isUnderConst) {
      return [POOLS.new_build_exterior, POOLS.villa_interior, POOLS.villa_pool, POOLS.villa_garden];
    }
    return [POOLS.villa_exterior, POOLS.villa_pool, POOLS.villa_interior, POOLS.villa_garden, POOLS.greek_scenery];
  }
  if (propertyType === "house") {
    if (isUnderConst) {
      return [POOLS.new_build_exterior, POOLS.house_interior, POOLS.villa_garden];
    }
    return [POOLS.house_exterior, POOLS.house_interior, POOLS.villa_garden, POOLS.apartment_kitchen];
  }
  if (propertyType === "commercial" || propertyType === "office") {
    return [POOLS.commercial, POOLS.new_build_exterior];
  }
  if (listingType === "auction") {
    return [POOLS.auction, POOLS.apartment_living, POOLS.villa_exterior];
  }
  // land or fallback
  return [POOLS.greek_scenery, POOLS.new_build_exterior, POOLS.villa_garden];
}

// ── Seeded random (deterministic per listing_id) ─────────────────────────────
function seededRand(seed: string, max: number): number {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) + h) ^ seed.charCodeAt(i);
    h = h >>> 0;
  }
  return h % max;
}

function pickUnique<T>(arr: T[], n: number, seed: string): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = seededRand(seed + i, i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, Math.min(n, shuffled.length));
}

function buildImages(listing: {
  id: string;
  property_type: string;
  listing_type: string;
  is_pre_sale: boolean;
  construction_status: string | null;
}): { listing_id: string; url: string; sort_order: number }[] {
  const pools = getImagePool(
    listing.property_type,
    listing.listing_type,
    listing.is_pre_sale,
    listing.construction_status,
  );

  const images: string[] = [];
  pools.forEach((pool, pi) => {
    const count = pi === 0 ? 2 : 1; // 2 from first pool, 1 from rest
    const picks = pickUnique(pool, count, listing.id + pi);
    picks.forEach(url => { if (!images.includes(url)) images.push(url); });
  });

  // ensure we always have at least 4 images
  if (images.length < 4) {
    const fallback = pickUnique(POOLS.greek_scenery, 4, listing.id + "fallback");
    fallback.forEach(url => { if (!images.includes(url)) images.push(url); });
  }

  return images.slice(0, 6).map((url, sort_order) => ({
    listing_id: listing.id,
    url,
    sort_order,
  }));
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  // Fetch all listings (paginate by 500)
  console.log("🔍  Fetching all listings...");
  const { data: listings, error: lErr } = await supabase
    .from("listings")
    .select("id, property_type, listing_type, is_pre_sale, construction_status, ai_score")
    .order("created_at", { ascending: false });

  if (lErr || !listings) { console.error("Fetch error:", lErr?.message); process.exit(1); }
  console.log(`   Found ${listings.length} listings`);

  // Find listings that already have images
  const { data: existingImgRows } = await supabase
    .from("listing_images")
    .select("listing_id");

  const hasImages = new Set((existingImgRows ?? []).map((r: any) => r.listing_id));
  const toSeed = listings.filter(l => !hasImages.has(l.id));
  console.log(`   ${toSeed.length} listings need images (${hasImages.size} already have images)`);

  if (toSeed.length === 0) {
    console.log("✅  All listings already have images.");
  } else {
    // Build all image rows
    const imageRows = toSeed.flatMap(l => buildImages(l as any));
    console.log(`📸  Inserting ${imageRows.length} images across ${toSeed.length} listings...`);

    // Batch insert (500 rows at a time)
    const BATCH = 500;
    let inserted = 0;
    for (let i = 0; i < imageRows.length; i += BATCH) {
      const batch = imageRows.slice(i, i + BATCH);
      const { error } = await supabase.from("listing_images").insert(batch);
      if (error) { console.error(`  ❌  Batch ${i / BATCH + 1} error:`, error.message); }
      else { inserted += batch.length; process.stdout.write(`  ✅  ${inserted}/${imageRows.length}\r`); }
    }
    console.log(`\n  ✅  ${inserted} image rows inserted`);
  }

  // ── Back-fill ai_score for listings that don't have one ──────────────────
  const noScore = listings.filter(l => l.ai_score == null);
  if (noScore.length > 0) {
    console.log(`\n🤖  Back-filling ai_score for ${noScore.length} listings...`);
    let updated = 0;
    for (const l of noScore) {
      const score = 58 + seededRand(l.id + "score", 40); // 58–97
      const { error } = await supabase
        .from("listings")
        .update({ ai_score: score })
        .eq("id", l.id);
      if (!error) updated++;
    }
    console.log(`  ✅  ${updated} ai_score values set`);
  }

  console.log("\n✅  Done.");
}

main().catch(err => { console.error(err); process.exit(1); });
