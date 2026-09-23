export async function requireProSubscription(
  userId,
  corsHeaders,
  options = {},
) {
  const scenario = globalThis.__projectManagementScenario;
  scenario.calls.push({ name: "proGate", args: { userId, options } });
  const allowed = scenario.proAllowed !== false;
  return {
    allowed,
    errorResponse: allowed ? null : new Response(
      JSON.stringify({
        error:
          "This feature requires a Pro subscription. Please upgrade your plan.",
      }),
      {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    ),
  };
}
