export async function logAuditEvent(event) {
  globalThis.__projectManagementScenario.calls.push({
    name: "audit",
    args: event,
  });
}
