import { LegalPolicyPage } from "@/components/LegalPolicyPage";

// Legal invariant anchors live in locale content: You may delete your account at any time; Data retained for legal reasons will be handled as described in our Privacy Policy.
export default function TermsOfService() {
  return <LegalPolicyPage policyKey="terms" />;
}
