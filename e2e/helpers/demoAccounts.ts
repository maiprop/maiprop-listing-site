function firstDefined(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => value !== undefined && value !== "");
}

function env(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key];
    if (value && value !== "") return value;
  }
  return undefined;
}

function account(defaultEmail: string, ...envKeys: string[]) {
  return firstDefined(env(...envKeys), defaultEmail)!;
}

function password(...envKeys: string[]) {
  return firstDefined(env(...envKeys), "Demo2025!")!;
}

export const demoAccounts = {
  buyerFree: account("buyer.free@maiprop.demo", "E2E_BUYER_FREE_EMAIL", "E2E_BUYER_EMAIL", "E2E_TEST_EMAIL"),
  buyerPro: account("buyer.pro@maiprop.demo", "E2E_BUYER_PRO_EMAIL", "E2E_BUYER_EMAIL"),
  sellerFree: account("seller.free@maiprop.demo", "E2E_SELLER_FREE_EMAIL", "E2E_SELLER_EMAIL"),
  sellerPro: account("seller.pro@maiprop.demo", "E2E_SELLER_PRO_EMAIL", "E2E_SELLER_EMAIL", "E2E_TEST_EMAIL"),
  agentFree: account("agent.free@maiprop.demo", "E2E_AGENT_FREE_EMAIL", "E2E_AGENT_EMAIL"),
  agentPro: account("agent.pro@maiprop.demo", "E2E_AGENT_PRO_EMAIL", "E2E_AGENT_EMAIL"),
  developerFree: account("developer.free@maiprop.demo", "E2E_DEVELOPER_FREE_EMAIL", "E2E_DEVELOPER_EMAIL"),
  developerPro: account("developer.pro@maiprop.demo", "E2E_DEVELOPER_PRO_EMAIL", "E2E_DEVELOPER_EMAIL"),
  investorPrivate: account("investor.private@maiprop.demo", "E2E_INVESTOR_PRIVATE_EMAIL"),
  investorInstitutional: account("investor.institutional@maiprop.demo", "E2E_INVESTOR_INSTITUTIONAL_EMAIL"),
  admin: account("admin@maiprop.demo", "E2E_ADMIN_EMAIL"),
  professionalArchitect: account("architect.pro@maiprop.demo", "E2E_PROFESSIONAL_ARCHITECT_EMAIL", "E2E_PROFESSIONAL1_EMAIL"),
  professionalLawyer: account("lawyer.pro@maiprop.demo", "E2E_PROFESSIONAL_LAWYER_EMAIL", "E2E_PROFESSIONAL2_EMAIL"),
  professionalValuer: account("valuer.pro@maiprop.demo", "E2E_PROFESSIONAL_VALUER_EMAIL", "E2E_PROFESSIONAL3_EMAIL"),
};

export const demoPasswords = {
  default: password("E2E_DEMO_PASSWORD", "E2E_TEST_PASSWORD"),
  buyerFree: password("E2E_BUYER_FREE_PASSWORD", "E2E_BUYER_PASSWORD", "E2E_DEMO_PASSWORD", "E2E_TEST_PASSWORD"),
  buyerPro: password("E2E_BUYER_PRO_PASSWORD", "E2E_BUYER_PASSWORD", "E2E_DEMO_PASSWORD"),
  sellerPro: password("E2E_SELLER_PRO_PASSWORD", "E2E_SELLER_PASSWORD", "E2E_DEMO_PASSWORD", "E2E_TEST_PASSWORD"),
  agentPro: password("E2E_AGENT_PRO_PASSWORD", "E2E_AGENT_PASSWORD", "E2E_DEMO_PASSWORD"),
  developerPro: password("E2E_DEVELOPER_PRO_PASSWORD", "E2E_DEVELOPER_PASSWORD", "E2E_DEMO_PASSWORD"),
  investorPrivate: password("E2E_INVESTOR_PRIVATE_PASSWORD", "E2E_DEMO_PASSWORD"),
  investorInstitutional: password("E2E_INVESTOR_INSTITUTIONAL_PASSWORD", "E2E_DEMO_PASSWORD"),
  admin: password("E2E_ADMIN_PASSWORD", "E2E_DEMO_PASSWORD"),
  professionalArchitect: password("E2E_PROFESSIONAL_ARCHITECT_PASSWORD", "E2E_PROFESSIONAL1_PASSWORD", "E2E_DEMO_PASSWORD"),
  professionalLawyer: password("E2E_PROFESSIONAL_LAWYER_PASSWORD", "E2E_PROFESSIONAL2_PASSWORD", "E2E_DEMO_PASSWORD"),
  professionalValuer: password("E2E_PROFESSIONAL_VALUER_PASSWORD", "E2E_PROFESSIONAL3_PASSWORD", "E2E_DEMO_PASSWORD"),
};

export const seededAccountNotes = {
  preferredBuyerEmail: demoAccounts.buyerFree,
  legacyProfessionalAliases: [
    "professional1@maiprop.demo -> architect.pro@maiprop.demo",
    "professional2@maiprop.demo -> lawyer.pro@maiprop.demo",
    "professional3@maiprop.demo -> valuer.pro@maiprop.demo",
  ],
};

export function seededDemoAccountsEnabled(...requiredEnvKeys: string[]) {
  if (process.env.E2E_USE_SEEDED_DEMO_ACCOUNTS === "true") return true;
  return requiredEnvKeys.every((key) => Boolean(process.env[key]));
}
