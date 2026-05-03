/**
 * Seed mock professional directory entries into the `professionals` table,
 * plus associated `professional_services` rows.
 *
 * Run:  npm run seed:professionals
 * Requires: SUPABASE_SERVICE_ROLE_KEY
 *
 * Looks up existing professional user accounts from the profiles table
 * (seeded by seed-mock-users.ts) and upserts rich directory entries for
 * 12 professionals covering all major categories, spread across Greek cities.
 *
 * Beyond the 3 professional accounts from seed-mock-users.ts, additional
 * standalone entries (no auth account) are also inserted so the directory
 * has critical mass for UI testing.
 */

import { createClient } from "@supabase/supabase-js";
import { getSeedEnv } from "./_seed-env";

const { supabaseUrl: SUPABASE_URL, serviceRoleKey: SERVICE_ROLE_KEY } = getSeedEnv();

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Emails that seed-mock-users.ts created with role=professional
const SEEDED_PROFESSIONAL_EMAILS = [
  "professional1@maiprop.demo", // Stella Architect
  "professional2@maiprop.demo", // Michalis Lawyer
  "professional3@maiprop.demo", // Fotini Valuer
];

type ProfessionalCategory =
  | "architect"
  | "civil_engineer"
  | "lawyer"
  | "notary"
  | "electrician"
  | "plumber"
  | "contractor"
  | "property_manager"
  | "valuer"
  | "interior_designer"
  | "financial_advisor"
  | "real_estate_agent"
  | "insurance_broker"
  | "relocation_immigration_consultant"
  | "building_permit_consultant";

interface ProfessionalData {
  // If email is provided, user_id will be looked up; otherwise a placeholder UUID is used.
  email?: string;
  display_name: string;
  title: string;
  category: ProfessionalCategory;
  bio: string;
  city: string;
  specialties: string[];
  languages: string[];
  experience_years: number;
  rating: number;
  reviews_count: number;
  hourly_rate: number;
  projects_count: number;
  verified: boolean;
  license_number?: string;
  website_url?: string;
  avatar_url: string;
  subscription_tier: "free" | "starter" | "pro" | "elite";
  average_deal_size?: string;
  calendar_notes?: string;
}

interface ServiceData {
  service_key: string;
  service_name: string;
  category: string;
  description: string;
  pricing_model: "hourly" | "fixed" | "percentage" | "quote";
  rate_amount: number;
  currency: string;
  estimated_hours: number | null;
  is_active: boolean;
  is_premium: boolean;
  video_enabled: boolean;
}

const PROFESSIONALS: ProfessionalData[] = [
  // ── Seeded auth accounts ────────────────────────────────────────────────────
  {
    email: "professional1@maiprop.demo",
    display_name: "Stella Architect",
    title: "Licensed Architect",
    category: "architect",
    bio: "Registered architect with 14 years of experience in residential and mixed-use projects across Attica. Specialising in new-build design, building permit applications, and renovation management. TEE member.",
    city: "Athens",
    specialties: ["Residential Design", "Building Permits", "Renovation Management", "Energy Certificates", "3D Visualisation"],
    languages: ["Greek", "English", "Italian"],
    experience_years: 14,
    rating: 4.8,
    reviews_count: 37,
    hourly_rate: 95,
    projects_count: 112,
    verified: true,
    license_number: "TEE-AR-00231",
    website_url: "https://stellaarch.gr",
    avatar_url: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400&q=80",
    subscription_tier: "pro",
    calendar_notes: "Available Mon–Fri 09:00–18:00. Initial 30-min consultation free.",
  },
  {
    email: "professional2@maiprop.demo",
    display_name: "Michalis Lawyer",
    title: "Property & Real Estate Lawyer",
    category: "lawyer",
    bio: "Athens Bar Association member specialising in property law, title searches, purchase agreements, and Golden Visa applications. Over 18 years acting for buyers, sellers, and foreign investors in Greek real estate.",
    city: "Athens",
    specialties: ["Title Searches", "Purchase Agreements", "Golden Visa", "Inheritance Law", "Commercial Leases"],
    languages: ["Greek", "English", "French"],
    experience_years: 18,
    rating: 4.9,
    reviews_count: 64,
    hourly_rate: 150,
    projects_count: 280,
    verified: true,
    license_number: "DSA-2006-114",
    website_url: "https://michalis-law.gr",
    avatar_url: "https://images.unsplash.com/photo-1560250097-0b93528c311a?w=400&q=80",
    subscription_tier: "elite",
    average_deal_size: "€450,000",
    calendar_notes: "Consultations by appointment. Urgent requests accommodated within 24h.",
  },
  {
    email: "professional3@maiprop.demo",
    display_name: "Fotini Valuer",
    title: "Certified Property Valuer",
    category: "valuer",
    bio: "RICS-certified valuer and member of the Greek Valuation Institute. Provides residential and commercial valuations for purchase, mortgage, insurance, and litigation purposes across the greater Athens area.",
    city: "Athens",
    specialties: ["Residential Valuations", "Commercial Valuations", "Mortgage Reports", "Insurance Valuations", "Portfolio Assessment"],
    languages: ["Greek", "English"],
    experience_years: 10,
    rating: 4.7,
    reviews_count: 29,
    hourly_rate: 120,
    projects_count: 95,
    verified: true,
    license_number: "GVI-V-0887",
    avatar_url: "https://images.unsplash.com/photo-1551836022-d5d88e9218df?w=400&q=80",
    subscription_tier: "starter",
    calendar_notes: "Reports delivered within 5 business days. Site visit required.",
  },

  // ── Additional directory-only professionals ──────────────────────────────────
  {
    display_name: "Nikos Papadopoulos",
    title: "Notary Public",
    category: "notary",
    bio: "Notary with 22 years of practice in Athens. Handles property transfers, mortgage deeds, corporate resolutions, and inheritance declarations. Fluent service for international clients.",
    city: "Athens",
    specialties: ["Property Transfers", "Mortgage Deeds", "Inheritance Declarations", "Corporate Deeds", "Golden Visa Notarisation"],
    languages: ["Greek", "English", "German"],
    experience_years: 22,
    rating: 4.9,
    reviews_count: 158,
    hourly_rate: 0,
    projects_count: 950,
    verified: true,
    license_number: "HON-ATH-0042",
    avatar_url: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400&q=80",
    subscription_tier: "pro",
    calendar_notes: "State-regulated fees apply. Contact for quote.",
  },
  {
    display_name: "Eleni Stavros",
    title: "Civil Engineer",
    category: "civil_engineer",
    bio: "Civil and structural engineer with a track record on 60+ residential and commercial projects in Thessaloniki. Expert in structural surveys, permits, energy assessments, and seismic upgrading.",
    city: "Thessaloniki",
    specialties: ["Structural Surveys", "Seismic Upgrading", "Energy Certificates", "Building Permits", "Site Supervision"],
    languages: ["Greek", "English"],
    experience_years: 16,
    rating: 4.6,
    reviews_count: 42,
    hourly_rate: 85,
    projects_count: 63,
    verified: true,
    license_number: "TEE-CE-00784",
    website_url: "https://stavros-engineering.gr",
    avatar_url: "https://images.unsplash.com/photo-1594744803329-e58b31de8bf5?w=400&q=80",
    subscription_tier: "starter",
  },
  {
    display_name: "Kostas Angelis",
    title: "General Contractor",
    category: "contractor",
    bio: "Full-service construction and renovation contractor based in Glyfada, serving the southern Athens suburbs. From bathroom upgrades to full-scale apartment renovations — fixed price, on time.",
    city: "Glyfada",
    specialties: ["Full Renovations", "Bathroom Upgrades", "Kitchen Fitting", "Floor Tiling", "Plastering & Painting"],
    languages: ["Greek", "English"],
    experience_years: 20,
    rating: 4.5,
    reviews_count: 81,
    hourly_rate: 45,
    projects_count: 200,
    verified: false,
    avatar_url: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&q=80",
    subscription_tier: "free",
    calendar_notes: "Free on-site quote within 48h.",
  },
  {
    display_name: "Despina Karagianni",
    title: "Interior Designer",
    category: "interior_designer",
    bio: "Award-winning interior designer with studios in Kifisia and Thessaloniki. Creates sophisticated, liveable spaces for residential and boutique hospitality clients. Portfolio available on request.",
    city: "Kifisia",
    specialties: ["Residential Interior Design", "Furniture Sourcing", "Lighting Design", "Project Management", "3D Renders"],
    languages: ["Greek", "English", "French"],
    experience_years: 12,
    rating: 4.8,
    reviews_count: 54,
    hourly_rate: 110,
    projects_count: 78,
    verified: true,
    website_url: "https://despina-design.gr",
    avatar_url: "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=400&q=80",
    subscription_tier: "pro",
    calendar_notes: "Studio visits by appointment in Kifisia. Video call available.",
  },
  {
    display_name: "Alexandros Mitsis",
    title: "Financial & Tax Advisor",
    category: "financial_advisor",
    bio: "Certified accountant and financial advisor specialising in real estate tax planning, ENFIA optimisation, rental income reporting, and non-dom regime for foreign buyers moving to Greece.",
    city: "Athens",
    specialties: ["ENFIA Optimisation", "Rental Income Tax", "Non-Dom Regime", "Capital Gains Planning", "Company Structures"],
    languages: ["Greek", "English"],
    experience_years: 15,
    rating: 4.7,
    reviews_count: 47,
    hourly_rate: 130,
    projects_count: 190,
    verified: true,
    license_number: "ELTE-0331",
    website_url: "https://mitsis-tax.gr",
    avatar_url: "https://images.unsplash.com/photo-1463453091185-61582044d556?w=400&q=80",
    subscription_tier: "pro",
    average_deal_size: "€280,000",
  },
  {
    display_name: "Maria Papadimitriou",
    title: "Property Manager",
    category: "property_manager",
    bio: "Fully licensed property management company based in Thessaloniki, managing 80+ units for absentee owners. Services include tenant sourcing, rent collection, maintenance coordination, and monthly reporting.",
    city: "Thessaloniki",
    specialties: ["Tenant Sourcing", "Rent Collection", "Maintenance Coordination", "Short-Term Rental Management", "Monthly Reporting"],
    languages: ["Greek", "English", "Russian"],
    experience_years: 9,
    rating: 4.6,
    reviews_count: 33,
    hourly_rate: 0,
    projects_count: 85,
    verified: true,
    avatar_url: "https://images.unsplash.com/photo-1567532939604-b6b5b0db2604?w=400&q=80",
    subscription_tier: "starter",
    calendar_notes: "Management fee: 8% of monthly rent. One-off placement fee: 50% of one month's rent.",
  },
  {
    display_name: "Giorgos Lambrou",
    title: "Relocation & Immigration Consultant",
    category: "relocation_immigration_consultant",
    bio: "Specialist in Greek Golden Visa applications, Digital Nomad Visa, and full relocation support for expats arriving in Greece. Partners with top law firms and real estate agencies.",
    city: "Athens",
    specialties: ["Golden Visa Applications", "Digital Nomad Visa", "Expat Relocation", "School Enrolment", "Tax Registration"],
    languages: ["Greek", "English", "Arabic", "Chinese"],
    experience_years: 8,
    rating: 4.8,
    reviews_count: 62,
    hourly_rate: 100,
    projects_count: 145,
    verified: true,
    website_url: "https://greecerelocate.com",
    avatar_url: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&q=80",
    subscription_tier: "elite",
    average_deal_size: "€500,000",
    calendar_notes: "Free 20-min discovery call. Full service package available.",
  },
  {
    display_name: "Thanos Vranas",
    title: "Building Permit Consultant",
    category: "building_permit_consultant",
    bio: "Specialist in navigating the Greek planning system. Handles e:Άδειες applications, arbitrage of existing violations (τακτοποίηση), and expedited permits for renovation and extensions in Attica.",
    city: "Athens",
    specialties: ["e:Adeia Applications", "Regularisation (Taktopoiisi)", "Urban Planning Advice", "Energy Upgrades", "Permit Tracking"],
    languages: ["Greek", "English"],
    experience_years: 11,
    rating: 4.4,
    reviews_count: 28,
    hourly_rate: 75,
    projects_count: 130,
    verified: false,
    avatar_url: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=400&q=80",
    subscription_tier: "free",
  },
  {
    display_name: "Irene Konstantinou",
    title: "Real Estate Agent",
    category: "real_estate_agent",
    bio: "Licensed estate agent (REA Greece) based in Glyfada with 11 years focusing on the southern Athens coastal strip. Expert in Glyfada, Voula, Vouliagmeni, and Vari. Bilingual in English and Greek.",
    city: "Glyfada",
    specialties: ["Coastal Properties", "Luxury Villas", "Investment Flips", "Buyer Representation", "Off-Plan Sales"],
    languages: ["Greek", "English"],
    experience_years: 11,
    rating: 4.7,
    reviews_count: 89,
    hourly_rate: 0,
    projects_count: 310,
    verified: true,
    license_number: "REA-GR-04512",
    website_url: "https://glyfada-homes.gr",
    avatar_url: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400&q=80",
    subscription_tier: "pro",
    average_deal_size: "€620,000",
    calendar_notes: "Commission: 2% + VAT for sellers. Buyer representation at no charge.",
  },
];

// Service definitions keyed by professional category
const SERVICES_BY_CATEGORY: Record<string, ServiceData[]> = {
  architect: [
    { service_key: "arch_design", service_name: "Architectural Design Package", category: "design", description: "Full architectural drawings, planning sketches, and permit-ready documentation for new builds or extensions.", pricing_model: "fixed", rate_amount: 4500, currency: "EUR", estimated_hours: null, is_active: true, is_premium: false, video_enabled: false },
    { service_key: "arch_permits", service_name: "Building Permit Application", category: "permits", description: "End-to-end submission and follow-up of e:Άδεια building permit application with local authority.", pricing_model: "fixed", rate_amount: 1800, currency: "EUR", estimated_hours: null, is_active: true, is_premium: false, video_enabled: false },
    { service_key: "arch_consult", service_name: "Design Consultation (1h)", category: "consultation", description: "One-hour design review or advice session — in person or via video call.", pricing_model: "hourly", rate_amount: 95, currency: "EUR", estimated_hours: 1, is_active: true, is_premium: false, video_enabled: true },
  ],
  lawyer: [
    { service_key: "law_title", service_name: "Title Search & Legal Due Diligence", category: "due_diligence", description: "Full title chain review for the past 20 years, encumbrance checks, and written legal opinion.", pricing_model: "fixed", rate_amount: 800, currency: "EUR", estimated_hours: null, is_active: true, is_premium: false, video_enabled: false },
    { service_key: "law_purchase", service_name: "Purchase Agreement Drafting", category: "contracts", description: "Preparation and review of preliminary and final purchase agreements, negotiation support.", pricing_model: "fixed", rate_amount: 1200, currency: "EUR", estimated_hours: null, is_active: true, is_premium: false, video_enabled: false },
    { service_key: "law_golden_visa", service_name: "Golden Visa Application", category: "immigration", description: "Full application management for Greek Golden Visa including document preparation, submission, and follow-up.", pricing_model: "fixed", rate_amount: 3500, currency: "EUR", estimated_hours: null, is_active: true, is_premium: true, video_enabled: true },
    { service_key: "law_consult", service_name: "Legal Consultation (1h)", category: "consultation", description: "One-hour legal advice session on any property law matter.", pricing_model: "hourly", rate_amount: 150, currency: "EUR", estimated_hours: 1, is_active: true, is_premium: false, video_enabled: true },
  ],
  valuer: [
    { service_key: "val_residential", service_name: "Residential Valuation Report", category: "valuation", description: "Full RICS-compliant market value report for residential properties — suitable for purchase, mortgage, or insurance.", pricing_model: "fixed", rate_amount: 450, currency: "EUR", estimated_hours: null, is_active: true, is_premium: false, video_enabled: false },
    { service_key: "val_commercial", service_name: "Commercial Valuation Report", category: "valuation", description: "Market and investment value assessment for offices, retail units, and mixed-use assets.", pricing_model: "fixed", rate_amount: 850, currency: "EUR", estimated_hours: null, is_active: true, is_premium: false, video_enabled: false },
    { service_key: "val_desktop", service_name: "Desktop Valuation (AVM)", category: "valuation", description: "Automated desktop estimate without site visit — suitable for indicative purposes only.", pricing_model: "fixed", rate_amount: 150, currency: "EUR", estimated_hours: null, is_active: true, is_premium: false, video_enabled: false },
  ],
  notary: [
    { service_key: "not_transfer", service_name: "Property Transfer Deed", category: "notarisation", description: "Preparation and notarisation of the final property transfer deed (Συμβόλαιο Αγοραπωλησίας).", pricing_model: "percentage", rate_amount: 0.8, currency: "EUR", estimated_hours: null, is_active: true, is_premium: false, video_enabled: false },
    { service_key: "not_mortgage", service_name: "Mortgage Deed Notarisation", category: "notarisation", description: "Notarisation of bank mortgage deed for property purchase financing.", pricing_model: "percentage", rate_amount: 0.6, currency: "EUR", estimated_hours: null, is_active: true, is_premium: false, video_enabled: false },
  ],
  financial_advisor: [
    { service_key: "tax_enfia", service_name: "ENFIA Review & Objection", category: "tax", description: "Review of ENFIA assessment and filing of formal objection where the property is over-assessed.", pricing_model: "fixed", rate_amount: 350, currency: "EUR", estimated_hours: null, is_active: true, is_premium: false, video_enabled: false },
    { service_key: "tax_rental", service_name: "Rental Income Tax Return", category: "tax", description: "Preparation and filing of annual rental income tax return (E2 form) including VAT if applicable.", pricing_model: "fixed", rate_amount: 250, currency: "EUR", estimated_hours: null, is_active: true, is_premium: false, video_enabled: false },
    { service_key: "tax_nondom", service_name: "Non-Dom Tax Regime Application", category: "tax", description: "Full application for the Greek non-domicile flat-tax regime for HNW foreign residents (€100k annual lump sum).", pricing_model: "fixed", rate_amount: 2500, currency: "EUR", estimated_hours: null, is_active: true, is_premium: true, video_enabled: true },
  ],
  relocation_immigration_consultant: [
    { service_key: "reloc_gv", service_name: "Golden Visa Full Service", category: "immigration", description: "End-to-end coordination of property purchase and residency permit application for the Greek Golden Visa.", pricing_model: "fixed", rate_amount: 4500, currency: "EUR", estimated_hours: null, is_active: true, is_premium: true, video_enabled: true },
    { service_key: "reloc_dnv", service_name: "Digital Nomad Visa Package", category: "immigration", description: "Assistance with Greece Digital Nomad Visa documentation and application, including proof of income guidance.", pricing_model: "fixed", rate_amount: 1200, currency: "EUR", estimated_hours: null, is_active: true, is_premium: false, video_enabled: true },
    { service_key: "reloc_pack", service_name: "Full Relocation Package", category: "relocation", description: "Comprehensive relocation support: school search, bank account, tax number (AFM), and settling-in assistance.", pricing_model: "fixed", rate_amount: 2800, currency: "EUR", estimated_hours: null, is_active: true, is_premium: false, video_enabled: false },
  ],
};

async function main(): Promise<void> {
  console.log("Looking up seeded professional user accounts...");

  // Fetch user IDs for the seeded professional accounts
  const { data: authUsers } = await supabase.auth.admin.listUsers();
  const emailToUserId = new Map<string, string>();
  authUsers?.users?.forEach((u) => {
    if (u.email) emailToUserId.set(u.email, u.id);
  });

  for (const email of SEEDED_PROFESSIONAL_EMAILS) {
    const uid = emailToUserId.get(email);
    if (uid) {
      console.log(`  ✓ Found ${email} → ${uid}`);
    } else {
      console.log(`  ⚠  ${email} not found — run seed:users first to create professional accounts`);
    }
  }

  console.log("\nUpserting professional directory entries...");

  const insertedProfessionals: Array<{ id: string; category: string; display_name: string }> = [];

  for (const prof of PROFESSIONALS) {
    // Resolve user_id: use auth lookup if email provided, else create a fresh UUID
    let userId: string | null = null;
    if (prof.email) {
      userId = emailToUserId.get(prof.email) ?? null;
      if (!userId) {
        console.log(`  ⚠  Skipping ${prof.display_name} — user account not found (run seed:users first)`);
        continue;
      }
    }

    // Build insert payload; user_id is required by the schema
    // For standalone directory entries without an auth account, we cannot insert
    // (user_id is a NOT NULL FK). We use a synthetic auth user for those.
    if (!userId) {
      // Create a minimal auth user to satisfy the FK constraint
      const email = `${prof.display_name.toLowerCase().replace(/\s+/g, ".")}.demo@maiprop.demo`;
      const existingId = emailToUserId.get(email);
      if (existingId) {
        userId = existingId;
      } else {
        const { data: created, error: createErr } = await supabase.auth.admin.createUser({
          email,
          password: "Demo2025!",
          email_confirm: true,
          user_metadata: {
            first_name: prof.display_name.split(" ")[0],
            last_name: prof.display_name.split(" ").slice(1).join(" "),
          },
        });
        if (createErr) {
          console.error(`  ✗ Could not create auth user for ${prof.display_name}:`, createErr.message);
          continue;
        }
        userId = created.user.id;
        // Grant professional role
        await supabase.rpc("seed_grant_role", {
          user_ids: [userId],
          target_role: "professional",
        });
        console.log(`  ✓ Created auth account for ${prof.display_name} (${email})`);
      }
    }

    // Check for existing record to allow idempotent reruns
    const { data: existing } = await supabase
      .from("professionals")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    const payload = {
      user_id: userId,
      display_name: prof.display_name,
      title: prof.title,
      category: prof.category,
      bio: prof.bio,
      city: prof.city,
      specialties: prof.specialties,
      languages: prof.languages,
      experience_years: prof.experience_years,
      rating: prof.rating,
      reviews_count: prof.reviews_count,
      hourly_rate: prof.hourly_rate,
      projects_count: prof.projects_count,
      verified: prof.verified,
      license_number: prof.license_number ?? null,
      website_url: prof.website_url ?? null,
      avatar_url: prof.avatar_url,
      subscription_tier: prof.subscription_tier,
      average_deal_size: prof.average_deal_size ?? null,
      calendar_notes: prof.calendar_notes ?? null,
    };

    let profId: string;

    if (existing?.id) {
      const { error } = await supabase
        .from("professionals")
        .update(payload)
        .eq("id", existing.id);
      if (error) {
        console.error(`  ✗ ${prof.display_name}:`, error.message);
        continue;
      }
      profId = existing.id;
      console.log(`  ↺ ${prof.display_name} (${prof.category}) [updated]`);
    } else {
      const { data: inserted, error } = await supabase
        .from("professionals")
        .insert(payload)
        .select("id")
        .single();
      if (error) {
        console.error(`  ✗ ${prof.display_name}:`, error.message);
        continue;
      }
      profId = inserted.id;
      console.log(`  ✓ ${prof.display_name} (${prof.category})`);
    }

    insertedProfessionals.push({ id: profId, category: prof.category, display_name: prof.display_name });
  }

  console.log(`\nUpserted ${insertedProfessionals.length} professional records.`);

  // ── professional_services ──────────────────────────────────────────────────
  console.log("\nUpserting professional_services...");
  let totalServices = 0;

  for (const prof of insertedProfessionals) {
    const services = SERVICES_BY_CATEGORY[prof.category];
    if (!services || services.length === 0) continue;

    for (const svc of services) {
      const { error } = await supabase.from("professional_services").upsert(
        {
          professional_id: prof.id,
          service_key: svc.service_key,
          service_name: svc.service_name,
          category: svc.category,
          description: svc.description,
          pricing_model: svc.pricing_model,
          rate_amount: svc.rate_amount,
          currency: svc.currency,
          estimated_hours: svc.estimated_hours,
          is_active: svc.is_active,
          is_premium: svc.is_premium,
          video_enabled: svc.video_enabled,
        },
        { onConflict: "professional_id,service_key" }
      );
      if (error) {
        console.error(`    ✗ ${prof.display_name} / ${svc.service_key}:`, error.message);
      } else {
        totalServices++;
      }
    }
    console.log(`  ✓ ${prof.display_name}: ${services.length} service(s)`);
  }

  console.log(`\nUpserted ${totalServices} professional_services rows.`);

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log("\n✅ Seed complete.");
  console.log(`   Professionals : ${insertedProfessionals.length}`);
  console.log(`   Services      : ${totalServices}`);
  console.log("\nProfessionals by category:");
  const byCategory = insertedProfessionals.reduce<Record<string, string[]>>((acc, p) => {
    acc[p.category] = acc[p.category] ?? [];
    acc[p.category].push(p.display_name);
    return acc;
  }, {});
  for (const [cat, names] of Object.entries(byCategory)) {
    console.log(`  ${cat}: ${names.join(", ")}`);
  }
  console.log("\nCities covered: Athens, Thessaloniki, Glyfada, Kifisia");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
