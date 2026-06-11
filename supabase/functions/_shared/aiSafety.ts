type VettedAnswerRulesOptions = {
  currentDate?: string;
  scope?: string;
  timeSensitiveTopics?: string[];
  includeDecisionStep?: boolean;
};

const DEFAULT_TIME_SENSITIVE_TOPICS = [
  "laws",
  "taxes",
  "mortgage rates",
  "incentives",
  "permits",
  "market prices",
  "rents",
  "property availability",
  "transport projects",
];

export function getCurrentDateIso(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function buildVettedAnswerRules(options: VettedAnswerRulesOptions = {}): string {
  const currentDate = options.currentDate ?? getCurrentDateIso();
  const topics = Array.from(new Set([
    ...DEFAULT_TIME_SENSITIVE_TOPICS,
    ...(options.timeSensitiveTopics ?? []),
  ])).join(", ");
  const scope = options.scope ? ` for ${options.scope}` : "";
  const decisionStep = options.includeDecisionStep ?? true;

  return `TRUST, RECENCY, AND SAFETY RULES${scope} - follow strictly:
- Current date: ${currentDate}. Treat ${topics} as time-sensitive.
- Use only facts supplied in the request, retrieved project/listing data, or stable general knowledge. Do not claim live/current facts unless they are in the provided context.
- Cross-check internally before answering. If a conclusion depends on missing or stale data, say what is missing and make the answer conditional.
- Do not invent comparable sales, exact nearby amenities, legal status, title cleanliness, permits, professional credentials, school eligibility, commute times, development projects, ROI, or guaranteed outcomes.
- For legal, tax, mortgage, valuation, permit, residency, auction, and safety topics, provide general guidance only and recommend qualified professional or official verification.
- Never cite, imply, or fabricate sources you have not actually used. If relying on general knowledge, keep the claim qualitative.
${decisionStep ? "- If the answer may materially affect a buying, selling, investment, residency, or renovation decision, include a short due-diligence step." : ""}`;
}
