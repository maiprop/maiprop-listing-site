export async function logAuditEvent(event) {
  globalThis.__createNewBuildingScenario.calls.push({
    name: "audit",
    args: event,
  });
}
