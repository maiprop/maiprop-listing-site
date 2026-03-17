import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ALL_POI = [
  "Airport",
  "Sea",
  "Ports",
  "Train Stations",
  "Motorway Access",
  "Schools",
  "Supermarket",
  "Pharmacies",
  "Hospitals",
  "Parthenon",
  "Parks",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { location, property_id } = await req.json();
    if (!location) {
      return new Response(JSON.stringify({ error: "location is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check DB cache first
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (property_id) {
      const { data: prop } = await supabase
        .from("properties")
        .select("poi_cache")
        .eq("id", property_id)
        .single();

      if (prop?.poi_cache && Array.isArray(prop.poi_cache) && prop.poi_cache.length > 0) {
        console.log("Returning cached POI for", location);
        return new Response(JSON.stringify({ poi: prop.poi_cache, cached: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const prompt = `You are a geography expert about Greece. Given the location "${location}, Greece", determine which of the following points of interest are realistically nearby or easily accessible from this area, and estimate the driving/travel time to each.

Points of Interest to evaluate:
${ALL_POI.map((p) => `- ${p}`).join("\n")}

Return ONLY the ones that are relevant. For example, "Parthenon" is only relevant for Athens area properties. "Sea" is relevant for coastal locations. "Airport" is relevant if there's an airport within reasonable distance (~60 min).

For each relevant POI, provide an estimated travel time (e.g. "5 min", "15 min", "30 min", "45 min", "1 hr").`;

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            {
              role: "system",
              content:
                "You determine which points of interest are near a Greek location and estimate travel times. Respond using the provided tool.",
            },
            { role: "user", content: prompt },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "return_relevant_poi",
                description:
                  "Return the list of relevant points of interest with distance estimates for this location",
                parameters: {
                  type: "object",
                  properties: {
                    relevant_poi: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          name: {
                            type: "string",
                            enum: ALL_POI,
                            description: "The POI name",
                          },
                          distance: {
                            type: "string",
                            description:
                              "Estimated travel time, e.g. '5 min', '15 min', '30 min', '1 hr'",
                          },
                        },
                        required: ["name", "distance"],
                        additionalProperties: false,
                      },
                      description:
                        "The POIs that are relevant to this location with distance estimates",
                    },
                  },
                  required: ["relevant_poi"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: {
            type: "function",
            function: { name: "return_relevant_poi" },
          },
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limited, please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment required." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      const fallback = ALL_POI.map((name) => ({ name, distance: "" }));
      return new Response(JSON.stringify({ poi: fallback }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    let result = ALL_POI.map((name) => ({ name, distance: "" }));

    if (toolCall?.function?.arguments) {
      const args = JSON.parse(toolCall.function.arguments);
      if (args.relevant_poi && Array.isArray(args.relevant_poi)) {
        result = args.relevant_poi;
      }
    }

    // Cache in DB
    if (property_id) {
      const { error: updateError } = await supabase
        .from("properties")
        .update({ poi_cache: result })
        .eq("id", property_id);

      if (updateError) {
        console.error("Failed to cache POI:", updateError);
      } else {
        console.log("Cached POI for property", property_id);
      }
    }

    return new Response(JSON.stringify({ poi: result, cached: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("location-poi error:", e);
    const fallback = ALL_POI.map((name) => ({ name, distance: "" }));
    return new Response(
      JSON.stringify({ poi: fallback, error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
