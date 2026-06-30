const BILLING_CONTACT_EMAIL = "support@maiprop.co";

type BillingContactInput = {
  topic?: string | null;
  participantType?: string | null;
  addonName?: string | null;
  addonKey?: string | null;
};

const compactLines = (lines: Array<string | null | undefined>) =>
  lines.filter((line): line is string => Boolean(line));

export const buildBillingContactHref = ({
  topic,
  participantType,
  addonName,
  addonKey,
}: BillingContactInput = {}) => {
  const subjectTopic = topic ?? addonName ?? "Billing support";
  const subject = `maiProp billing request: ${subjectTopic}`;
  const body = compactLines([
    "Hi maiProp team,",
    "",
    addonName ? `I would like help with: ${addonName}.` : "I would like help with billing or add-ons.",
    participantType ? `Account type: ${participantType}` : null,
    addonKey ? `Add-on key: ${addonKey}` : null,
    "",
    "Please contact me with the next steps.",
  ]).join("\n");

  return `mailto:${BILLING_CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
};
