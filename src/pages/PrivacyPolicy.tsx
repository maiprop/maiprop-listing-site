import { LegalPolicyPage } from "@/components/LegalPolicyPage";

// Legal invariant anchors live in locale content: Right to Erasure, overriding legal basis, Data Retention.
export default function PrivacyPolicy() {
  return <LegalPolicyPage policyKey="privacy" />;
}
