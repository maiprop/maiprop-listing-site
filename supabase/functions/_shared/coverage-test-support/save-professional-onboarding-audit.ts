export async function logAuditEvent(event) {
  globalThis.__saveProfessionalOnboardingScenario.calls.push({
    name: "audit",
    args: event,
  });
}
