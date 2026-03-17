import { createClient } from "npm:@supabase/supabase-js@2";

const BASE_URL = "https://properties.maiprop.co";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Social bot user-agent patterns
const BOT_UA = /facebookexternalhit|facebot|twitterbot|whatsapp|linkedinbot|slackbot|telegrambot|discordbot|googlebot|bingbot|applebot|pinterest|vkshare|w3c_validator/i;

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const propertyId = url.searchParams.get("id");

    if (!propertyId) {
      return new Response(JSON.stringify({ error: "Missing id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: property, error } = await supabase
      .from("properties")
      .select("id, title, description, location, price, size, bedrooms, images, status, yield, tags")
      .eq("id", propertyId)
      .single();

    if (error || !property) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const pageUrl = `${BASE_URL}/property/${property.id}`;
    const ogImage = property.images?.[0]
      ? `${property.images[0]}?width=1200&height=630&fit=cover`
      : `${BASE_URL}/og-image.png`;

    const rawTitle = `${property.title} | ${property.location} | mAI Investments`;
    const title = escapeHtml(rawTitle.length > 60 ? `${property.title} | mAI Investments` : rawTitle);
    const description = escapeHtml(
      property.description
        ? property.description.slice(0, 155) + (property.description.length > 155 ? "…" : "")
        : `${property.title} in ${property.location}, Greece.${property.price ? ` €${property.price.toLocaleString()}` : ""}${property.size ? ` · ${property.size} m²` : ""} Golden Visa eligible property.`
    );
    const keywords = escapeHtml([
      `Golden Visa ${property.location}`,
      `${property.location} real estate investment`,
      `Greek Golden Visa property`,
      `EU residency ${property.location}`,
      `Greece property investment`,
      ...(property.tags?.filter(Boolean).slice(0, 4) ?? []),
      property.bedrooms ? `${property.bedrooms} bedroom apartment Greece` : null,
    ].filter(Boolean).join(", "));
    const safeOgImage = escapeHtml(ogImage);
    const safePageUrl = escapeHtml(pageUrl);

    // Breadcrumb JSON-LD
    const breadcrumbLd = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: BASE_URL + "/" },
        { "@type": "ListItem", position: 2, name: "Properties", item: BASE_URL + "/#opportunities" },
        { "@type": "ListItem", position: 3, name: property.title, item: pageUrl },
      ],
    });

    // Apartment JSON-LD
    const apartmentLd = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Apartment",
      name: property.title,
      description: property.description || `${property.title} in ${property.location}, Greece.`,
      url: pageUrl,
      image: property.images?.[0] || ogImage,
      address: { "@type": "PostalAddress", addressLocality: property.location, addressCountry: "GR" },
      ...(property.price ? {
        offers: {
          "@type": "Offer",
          price: property.price,
          priceCurrency: "EUR",
          availability: property.status === "available"
            ? "https://schema.org/InStock"
            : "https://schema.org/SoldOut",
        }
      } : {}),
      ...(property.size ? { floorSize: { "@type": "QuantitativeValue", value: property.size, unitCode: "MTK" } } : {}),
      ...(property.bedrooms ? { numberOfRooms: property.bedrooms } : {}),
    });

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <meta name="description" content="${description}" />
  <meta name="keywords" content="${keywords}" />
  <link rel="canonical" href="${safePageUrl}" />

  <!-- Open Graph -->
  <meta property="og:type" content="product" />
  <meta property="og:url" content="${safePageUrl}" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:image" content="${safeOgImage}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:site_name" content="mAI Investments" />

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${description}" />
  <meta name="twitter:image" content="${safeOgImage}" />

  <!-- Structured Data -->
  <script type="application/ld+json">${apartmentLd}</script>
  <script type="application/ld+json">${breadcrumbLd}</script>

  <!-- Redirect real browsers to the SPA -->
  <noscript><meta http-equiv="refresh" content="0;url=${safePageUrl}" /></noscript>
  <script>
    // Redirect real users to the SPA immediately
    window.location.replace("${pageUrl}");
  </script>
</head>
<body>
  <h1>${escapeHtml(property.title)}</h1>
  <p>${description}</p>
  <p><a href="${safePageUrl}">View property</a></p>
</body>
</html>`;

    return new Response(html, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
