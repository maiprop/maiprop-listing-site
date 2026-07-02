export function isPerformanceAdvisorInternalSyntaxFailure(status, detail, category = "") {
  return (
    category === "performance" &&
    status === 400 &&
    /Failed to run project advisor lints:\s*ERROR:\s*42601:\s*syntax error/i.test(String(detail))
  );
}

export function isTransientAdvisorFailure(status, detail) {
  if (status === 544) return true;
  return /connection terminated|connection timeout|i\/o timeout|timed out|timeout|econnreset|etimedout/i.test(
    String(detail),
  );
}
