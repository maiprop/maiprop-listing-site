import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { FileText } from "lucide-react";

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-16">
        <section className="py-16 container max-w-4xl">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-brand-gold/10 flex items-center justify-center">
              <FileText className="w-5 h-5 text-brand-gold" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Legal</p>
              <h1 className="font-display text-3xl font-bold">Terms of Service</h1>
            </div>
          </div>
          <p className="text-muted-foreground mb-10">Last updated: 9 March 2026 · These terms govern your use of the maiProp platform. Please read them carefully.</p>

          <div className="prose prose-invert max-w-none space-y-10 text-sm leading-relaxed text-foreground/85">

            <section>
              <h2 className="font-display text-xl font-bold text-foreground mb-3">1. Acceptance of Terms</h2>
              <p>By accessing or using maiProp ("<strong>Platform</strong>"), you ("<strong>User</strong>", "<strong>you</strong>") agree to be bound by these Terms of Service ("<strong>Terms</strong>"), our Privacy Policy, and our Cookie Policy (collectively the "<strong>Agreement</strong>"). The Platform is operated by <strong>maiProp Ltd</strong>, incorporated in Greece (GEMI registration, Athens). If you do not agree, you must immediately cease using the Platform.</p>
              <p className="mt-3">If you are using the Platform on behalf of a business, you represent that you have authority to bind that business to these Terms, and "you" shall refer to that entity.</p>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-foreground mb-3">2. Eligibility</h2>
              <p>You must be at least <strong>18 years old</strong> and capable of forming a legally binding contract under Greek law to use the Platform. By creating an account, you represent and warrant that:</p>
              <ul className="list-disc ml-6 mt-2 space-y-1">
                <li>You are at least 18 years of age;</li>
                <li>All registration information you provide is accurate and current;</li>
                <li>Your use of the Platform does not violate any applicable law or regulation;</li>
                <li>You are not subject to any sanction (EU, UN, or otherwise) that would prohibit you from transacting on the Platform.</li>
              </ul>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-foreground mb-3">3. Account Registration & Security</h2>
              <p>To access certain features, you must register an account. You agree to:</p>
              <ul className="list-disc ml-6 mt-2 space-y-1">
                <li>Provide accurate, complete, and up-to-date information;</li>
                <li>Maintain the confidentiality of your login credentials;</li>
                <li>Notify us immediately at <a href="mailto:security@maiprop.co" className="text-primary hover:underline">security@maiprop.co</a> of any unauthorised use of your account;</li>
                <li>Not share your account with any third party or allow others to access the Platform using your credentials;</li>
                <li>Not create multiple accounts to circumvent suspensions, bans, or Platform limits.</li>
              </ul>
              <p className="mt-3">You are solely responsible for all activities conducted through your account. maiProp Ltd shall not be liable for any loss arising from your failure to comply with these security obligations.</p>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-foreground mb-3">4. Platform Services</h2>
              <p>maiProp provides a technology platform that enables:</p>
              <ul className="list-disc ml-6 mt-2 space-y-1">
                <li><strong>Property Listings:</strong> Advertising residential, commercial, and land properties for sale or rent;</li>
                <li><strong>Greek Auction Listings:</strong> Aggregation and alerts for judicial (notarial), bank repo, and public authority auctions;</li>
                <li><strong>Quick Sale™ preliminary offers:</strong> AI-assisted valuation and cash offer facilitation for motivated sellers, subject to review and transaction checks;</li>
                <li><strong>Professional Directory:</strong> A marketplace connecting users with vetted real estate professionals;</li>
                <li><strong>AI Tools:</strong> Property valuation estimates, neighbourhood reports, smart search, and investment analytics;</li>
                <li><strong>Messaging:</strong> Direct communication between buyers, sellers, tenants, landlords, and professionals.</li>
              </ul>
              <p className="mt-3"><strong>Important:</strong> maiProp is a <em>technology intermediary</em>, not a real estate agent, broker, auctioneer, or financial advisor. We do not act as a party to any property transaction. We do not verify the legal title, planning status, or physical condition of any listed property. Any transaction you enter into is solely between you and the other party.</p>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-foreground mb-3">5. Listing Standards & Prohibited Content</h2>
              <p>All listings and content submitted to the Platform must:</p>
              <ul className="list-disc ml-6 mt-2 space-y-1">
                <li>Be accurate, truthful, and not misleading;</li>
                <li>Relate to a real property that the lister owns, is authorised to sell/rent, or has been engaged to list;</li>
                <li>Comply with all applicable Greek and EU laws, including Law 4495/2017 (building regulations), Law 4242/2014 (short-term rentals), and GDPR;</li>
                <li>Not infringe any third party's intellectual property, privacy, or other rights.</li>
              </ul>
              <p className="mt-3">The following content is strictly prohibited:</p>
              <ul className="list-disc ml-6 mt-2 space-y-1">
                <li>Fraudulent, fictitious, or duplicate listings;</li>
                <li>Properties with undisclosed legal encumbrances, mortgages, or disputes intended to deceive buyers;</li>
                <li>Discriminatory listings that violate Law 3304/2005 (equal treatment) or EU anti-discrimination directives;</li>
                <li>Listings designed to harvest user data or redirect users to phishing sites;</li>
                <li>Properties that are the subject of active court injunctions restricting their sale;</li>
                <li>Any content that is defamatory, obscene, threatening, or otherwise unlawful.</li>
              </ul>
              <p className="mt-3">We reserve the right to remove any listing that violates these standards, at our sole discretion, without prior notice and without refund of any listing fees paid.</p>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-foreground mb-3">6. AI-Generated Content & Valuations</h2>
              <p>Our AI tools — including property valuations, neighbourhood reports, smart filters, and investment scoring — are provided for <strong>informational and indicative purposes only</strong>. They do not constitute:</p>
              <ul className="list-disc ml-6 mt-2 space-y-1">
                <li>A professional property valuation under Greek law (PD 59/2024) or RICS standards;</li>
                <li>Legal, financial, investment, or tax advice;</li>
                <li>A binding offer or commitment by maiProp or any third party.</li>
              </ul>
              <p className="mt-3">AI outputs may contain errors, omissions, or inaccuracies. You should independently verify all information and seek professional advice before making any property-related decision. maiProp Ltd shall not be liable for any loss arising from reliance on AI-generated content.</p>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-foreground mb-3">7. Greek Auctions — Special Provisions</h2>
              <p>Our platform aggregates information about Greek judicial and administrative property auctions (πλειστηριασμοί). You acknowledge that:</p>
              <ul className="list-disc ml-6 mt-2 space-y-1">
                <li>Auction information is sourced from public records (e-auction.gr, court announcements) and may not be complete or current;</li>
                <li>Participation in Greek judicial auctions is subject to specific legal requirements under Greek Civil Procedure Code (Articles 959–1028);</li>
                <li>You are solely responsible for conducting your own due diligence, including obtaining a lawyer and reviewing the property's legal status before bidding;</li>
                <li>maiProp is not an e-auction platform; we do not facilitate actual bidding. We provide information and alerts only;</li>
                <li>Properties sold at judicial auction may be subject to existing encumbrances, squatter occupancy, or pending disputes.</li>
              </ul>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-foreground mb-3">8. Fees & Payments</h2>
              <p>Certain features of the Platform are subject to fees (e.g., premium listing packages, investor dashboard subscriptions, Quick Sale™ service fees). All fees are:</p>
              <ul className="list-disc ml-6 mt-2 space-y-1">
                <li>Displayed in Euros (€) inclusive of applicable Greek VAT (currently 24%);</li>
                <li>Non-refundable unless expressly stated in the relevant service agreement or required by Greek consumer law (Law 2251/1994);</li>
                <li>Processed via Stripe, a PCI DSS Level 1 compliant payment processor.</li>
              </ul>
              <p className="mt-3">If you believe a charge is in error, contact <a href="mailto:billing@maiprop.co" className="text-primary hover:underline">billing@maiprop.co</a> within 30 days of the charge date. We reserve the right to suspend access for non-payment.</p>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-foreground mb-3">9. Intellectual Property</h2>
              <p>All content on the Platform — including the maiProp brand, mAI Prop OS branding, software, databases, AI models, design, text, and aggregated market data — is owned by maiProp Ltd or licensed to us, and is protected by copyright, trademark, and database rights under Greek Law 2121/1993 and EU Directive 2019/790.</p>
              <p className="mt-3"><strong>Your content:</strong> By submitting listings, photos, or other content, you grant maiProp Ltd a <strong>worldwide, royalty-free, non-exclusive licence</strong> to display, reproduce, adapt, and distribute such content on the Platform and in marketing materials for as long as your account is active (and for a reasonable wind-down period thereafter). You retain ownership of your content and represent that you have the right to grant this licence.</p>
              <p className="mt-3">You must not copy, scrape, reproduce, or commercially exploit any Platform content without our express written permission.</p>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-foreground mb-3">10. Limitation of Liability</h2>
              <p>To the fullest extent permitted by applicable law:</p>
              <ul className="list-disc ml-6 mt-2 space-y-2">
                <li>The Platform is provided "<strong>as is</strong>" and "<strong>as available</strong>" without warranty of any kind, express or implied, including warranties of merchantability, fitness for a particular purpose, or non-infringement;</li>
                <li><strong>maiProp Ltd shall not be liable</strong> for any indirect, incidental, special, consequential, or punitive damages, including loss of profits, data, goodwill, or property value, arising from your use of — or inability to use — the Platform;</li>
                <li>Our total aggregate liability to you for any claim arising out of or relating to these Terms or the Platform shall not exceed the greater of: (a) the total fees you paid to us in the 12 months preceding the claim; or (b) €100;</li>
                <li>We do not guarantee the accuracy, completeness, or legality of any listing, AI output, auction information, or professional profile;</li>
                <li>We are not liable for any loss arising from transactions between users, failure of third-party services, or events beyond our reasonable control (force majeure).</li>
              </ul>
              <p className="mt-3">Nothing in these Terms limits liability for death, personal injury caused by our negligence, fraud, or any liability that cannot be limited by Greek or EU law.</p>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-foreground mb-3">11. Indemnification</h2>
              <p>You agree to defend, indemnify, and hold harmless maiProp Ltd, its directors, employees, contractors, and partners from and against any claims, liabilities, damages, losses, and expenses (including reasonable legal fees) arising out of or relating to:</p>
              <ul className="list-disc ml-6 mt-2 space-y-1">
                <li>Your breach of these Terms;</li>
                <li>Your violation of any applicable law or third-party right;</li>
                <li>Your content submitted to the Platform (including inaccurate or fraudulent listings);</li>
                <li>Any transaction you enter into through the Platform;</li>
                <li>Your negligent or wilful misconduct.</li>
              </ul>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-foreground mb-3">12. Termination & Suspension</h2>
              <p>We reserve the right to <strong>suspend or permanently terminate</strong> your account, without prior notice, if:</p>
              <ul className="list-disc ml-6 mt-2 space-y-1">
                <li>You breach these Terms or our policies;</li>
                <li>We receive verified reports of fraudulent activity;</li>
                <li>Required by law or a court order;</li>
                <li>Your account poses a security risk to the Platform or other users.</li>
              </ul>
              <p className="mt-3">You may delete your account at any time from your dashboard settings. Upon termination, your active listings will be removed. Data retained for legal reasons will be handled as described in our Privacy Policy. Termination does not relieve you of payment obligations for services already rendered.</p>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-foreground mb-3">13. Governing Law & Dispute Resolution</h2>
              <p>These Terms are governed by the <strong>laws of Greece</strong> and the EU. Any dispute arising from or relating to these Terms or the Platform shall be subject to the <strong>exclusive jurisdiction of the courts of Athens, Greece</strong>, without prejudice to mandatory consumer protection provisions that cannot be derogated by agreement.</p>
              <p className="mt-3"><strong>Alternative Dispute Resolution:</strong> EU consumers may submit disputes to the <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noreferrer" className="text-primary hover:underline">EU Online Dispute Resolution platform</a>. We are willing to participate in ADR proceedings but are not obliged to accept ADR outcomes.</p>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-foreground mb-3">14. Changes to Terms</h2>
              <p>We may update these Terms at any time. We will notify you of material changes via email and/or a platform notice at least <strong>30 days before</strong> they take effect. Your continued use of the Platform after the effective date constitutes acceptance of the updated Terms. If you do not agree to the updated Terms, you must close your account before the effective date.</p>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-foreground mb-3">15. Miscellaneous</h2>
              <ul className="list-disc ml-6 mt-2 space-y-2">
                <li><strong>Entire Agreement:</strong> These Terms, together with our Privacy Policy and Cookie Policy, constitute the entire agreement between you and maiProp Ltd regarding the Platform.</li>
                <li><strong>Severability:</strong> If any provision is found unlawful or unenforceable, it will be modified to the minimum extent necessary, and the remaining provisions remain in full force.</li>
                <li><strong>Waiver:</strong> Our failure to enforce any provision shall not constitute a waiver of that provision.</li>
                <li><strong>Assignment:</strong> You may not assign your rights under these Terms without our written consent. We may assign our rights to an affiliate or in connection with a business transfer.</li>
                <li><strong>Language:</strong> The authoritative version of these Terms is in English. Greek translations may be provided for convenience only.</li>
              </ul>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-foreground mb-3">16. Contact</h2>
              <p>For questions about these Terms: <a href="mailto:legal@maiprop.co" className="text-primary hover:underline">legal@maiprop.co</a> · maiProp Ltd, Kifissias Ave. 44, 15125 Athens, Greece.</p>
            </section>

          </div>
        </section>
      </div>
      <Footer />
    </div>
  );
}
