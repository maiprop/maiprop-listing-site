export function getOAuthErrorMessage(error: { message?: string; code?: string } | null): string {
  const message = error?.message?.toLowerCase() ?? "";
  const code = error?.code?.toLowerCase() ?? "";

  if (
    code === "validation_failed" ||
    message.includes("unsupported provider") ||
    message.includes("provider is not enabled")
  ) {
    return "Google sign-in is not enabled for this project yet. Please use email/password for now.";
  }

  return "Google sign-in failed. Please try again.";
}
