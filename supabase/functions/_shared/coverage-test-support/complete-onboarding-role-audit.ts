export async function logAuditEvent(event) {
  globalThis.__completeOnboardingScenario.calls.push({
    name: "audit",
    args: event,
  });
}
