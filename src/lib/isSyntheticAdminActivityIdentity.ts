function normalize(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

export function isSyntheticAdminActivityIdentity(email: string | null | undefined, displayName: string | null | undefined) {
  const normalizedEmail = normalize(email);
  const normalizedName = normalize(displayName);

  return normalizedEmail.endsWith("@maiprop.demo")
    || normalizedEmail.endsWith("@maiprop.test")
    || normalizedEmail.endsWith("@maiprop-test.co")
    || normalizedEmail.endsWith("@maiprop-e2e.test")
    || normalizedEmail.startsWith("stripe-")
    || normalizedEmail.startsWith("devin-")
    || normalizedName.startsWith("stripe ")
    || normalizedName.startsWith("devin ")
    || normalizedName.startsWith("test user")
    || normalizedName.startsWith("test_user")
    || normalizedName.startsWith("trial professional")
    || normalizedName.startsWith("codex live probe");
}
