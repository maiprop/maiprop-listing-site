import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Shield } from "lucide-react";

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-16">
        <section className="py-16 container max-w-4xl">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Shield className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Legal</p>
              <h1 className="font-display text-3xl font-bold">Privacy Policy</h1>
            </div>
          </div>
          <p className="text-muted-foreground mb-10">Last updated: 9 March 2026 · Effective immediately upon publication.</p>

          <div className="prose prose-invert max-w-none space-y-10 text-sm leading-relaxed text-foreground/85">

            <section>
              <h2 className="font-display text-xl font-bold text-foreground mb-3">1. Introduction & Identity of the Controller</h2>
              <p>maiProp ("<strong>we</strong>", "<strong>us</strong>", "<strong>our</strong>") is a real estate technology platform operated by <strong>maiProp Ltd</strong>, a company incorporated in Greece (Athens, Attica), registered with the Hellenic Companies Register (GEMI). We are the data controller within the meaning of the <strong>EU General Data Protection Regulation (GDPR) 2016/679</strong> and the Greek implementing law (Law 4624/2019).</p>
              <p className="mt-3">Contact: <a href="mailto:privacy@maiprop.co" className="text-primary hover:underline">privacy@maiprop.co</a> · +30 210 123 4567 · Kifissias Ave. 44, 15125 Athens, Greece.</p>
              <p className="mt-3">Our Data Protection Officer (DPO) can be reached at: <a href="mailto:dpo@maiprop.co" className="text-primary hover:underline">dpo@maiprop.co</a>.</p>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-foreground mb-3">2. Scope of This Policy</h2>
              <p>This Privacy Policy applies to all personal data collected and processed through:</p>
              <ul className="list-disc ml-6 mt-2 space-y-1">
                <li>The maiProp website (<strong>maiprop.co</strong>) and all subdomains (os.maiprop.co, properties.maiprop.co);</li>
                <li>Our mobile applications (iOS &amp; Android, where applicable);</li>
                <li>Any API integrations, embedded widgets, or third-party services we operate;</li>
                <li>Offline interactions with our staff or agents (e.g., property viewings, phone consultations).</li>
              </ul>
              <p className="mt-3">This Policy does not apply to third-party websites linked from our platform. We encourage you to review the privacy policies of any external sites you visit.</p>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-foreground mb-3">3. Categories of Personal Data We Collect</h2>
              <p>We collect the following categories of data, depending on how you use our services:</p>
              <div className="overflow-x-auto mt-3">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 pr-4 text-foreground font-semibold">Category</th>
                      <th className="text-left py-2 pr-4 text-foreground font-semibold">Examples</th>
                      <th className="text-left py-2 text-foreground font-semibold">Source</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {[
                      ["Identity Data", "First name, last name, username, date of birth", "Provided by you at registration"],
                      ["Contact Data", "Email address, phone number, postal address", "Provided by you"],
                      ["Account Credentials", "Hashed password, OAuth tokens", "Generated at registration"],
                      ["Profile Data", "Profile photo, bio, professional certifications, role", "Provided by you"],
                      ["Transaction Data", "Listing submissions, offer requests, firesale applications, auction alerts", "Your platform activity"],
                      ["Usage Data", "Pages visited, features used, click-stream, search queries, filter settings", "Automatically collected"],
                      ["Device & Technical Data", "IP address, browser type, operating system, device identifiers, time zone", "Automatically collected"],
                      ["Location Data", "Approximate location derived from IP; precise location if granted by browser", "Automatically collected or granted"],
                      ["Communications Data", "Messages between users, support tickets, consultation requests", "Your platform interactions"],
                      ["AI Interaction Data", "Prompts submitted to our AI assistant, search queries processed by AI", "Your platform interactions"],
                      ["Marketing Preferences", "Email opt-ins/outs, notification settings, saved searches", "Provided by you"],
                      ["Payment Data", "Billing name, card last 4 digits (via Stripe PCI-compliant tokenization; we never store full card numbers)", "Provided by you"],
                    ].map(([cat, ex, src]) => (
                      <tr key={cat}>
                        <td className="py-2 pr-4 font-medium text-foreground">{cat}</td>
                        <td className="py-2 pr-4 text-muted-foreground">{ex}</td>
                        <td className="py-2 text-muted-foreground">{src}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-4"><strong>Special category data:</strong> We do not intentionally collect data revealing racial origin, political opinions, health data, biometric data, or sexual orientation. If you voluntarily provide such data (e.g., in free-text messages), it will be processed only to deliver the service you requested and deleted as soon as possible.</p>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-foreground mb-3">4. Legal Bases for Processing (GDPR Article 6)</h2>
              <p>We process your personal data under the following legal bases:</p>
              <ul className="list-disc ml-6 mt-2 space-y-2">
                <li><strong>Performance of a Contract (Art. 6(1)(b)):</strong> Processing necessary to provide you with our platform services — including account management, listing services, viewing scheduling, messaging, and firesale/auction services.</li>
                <li><strong>Legitimate Interests (Art. 6(1)(f)):</strong> Fraud prevention, platform security, improving our AI models with aggregated/anonymised data, analytics, and direct marketing to existing customers (with opt-out). Our legitimate interests do not override your fundamental rights.</li>
                <li><strong>Legal Obligation (Art. 6(1)(c)):</strong> Complying with Greek and EU law, including tax obligations, anti-money-laundering (AML/KYC) requirements under Greek Law 4557/2018, and court orders.</li>
                <li><strong>Consent (Art. 6(1)(a)):</strong> Optional marketing communications, non-essential cookies, and AI-personalisation features (where not strictly necessary). You may withdraw consent at any time without affecting prior lawful processing.</li>
                <li><strong>Vital Interests (Art. 6(1)(d)):</strong> In emergency situations requiring protection of life.</li>
              </ul>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-foreground mb-3">5. How We Use Your Data</h2>
              <p>We use your data to:</p>
              <ul className="list-disc ml-6 mt-2 space-y-1">
                <li>Create and manage your account, verify your identity, and prevent duplicate accounts;</li>
                <li>Display, manage, and promote your property listings;</li>
                <li>Facilitate property viewings, auction alerts, firesale offers, and consultation requests;</li>
                <li>Power our AI search, property valuation, neighbourhood reports, and smart filter features;</li>
                <li>Process payments and comply with financial reporting obligations;</li>
                <li>Send transactional notifications (viewing confirmations, bid alerts, new messages);</li>
                <li>Send marketing communications where you have opted in or where permitted by law;</li>
                <li>Detect and prevent fraud, abuse, or security incidents;</li>
                <li>Conduct platform analytics to improve features and user experience;</li>
                <li>Comply with applicable Greek and EU legal obligations;</li>
                <li>Respond to your support requests and resolve disputes;</li>
                <li>Enforce our Terms of Service.</li>
              </ul>
              <p className="mt-3">We do not sell your personal data to third parties for their own marketing purposes.</p>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-foreground mb-3">6. Data Sharing & Third-Party Recipients</h2>
              <p>We may share your data with:</p>
              <ul className="list-disc ml-6 mt-2 space-y-2">
                <li><strong>Service Providers (Processors):</strong> Infrastructure (Supabase/AWS), email (Postmark/SendGrid), payment processing (Stripe), analytics (Mixpanel/PostHog — anonymised), AI services (Google/OpenAI — data processed under DPA), mapping (Mapbox). All processors are bound by GDPR-compliant Data Processing Agreements.</li>
                <li><strong>Platform Users:</strong> When you list a property, your contact information may be visible to registered users. When you send a message, the recipient sees your profile name and message content.</li>
                <li><strong>Professional Network:</strong> If you are a verified professional, your business profile is publicly visible on the platform.</li>
                <li><strong>Greek Authorities &amp; Courts:</strong> Tax authorities (AADE), financial intelligence unit (FIU), law enforcement, or courts — only when legally required.</li>
                <li><strong>Business Transfers:</strong> In connection with a merger, acquisition, restructuring, or sale of assets, with prior notice where required by law.</li>
                <li><strong>Aggregated / Anonymised Data:</strong> We may share anonymised, non-identifiable market statistics with third parties (e.g., press, research firms). This data cannot be used to identify you.</li>
              </ul>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-foreground mb-3">7. International Data Transfers</h2>
              <p>Your data is primarily stored and processed within the <strong>European Economic Area (EEA)</strong>. Where transfers occur outside the EEA (e.g., to OpenAI in the United States), we ensure appropriate safeguards are in place, including:</p>
              <ul className="list-disc ml-6 mt-2 space-y-1">
                <li>EU Standard Contractual Clauses (SCCs) approved by the European Commission;</li>
                <li>Adequacy decisions where applicable;</li>
                <li>Data minimisation (we transmit only what is necessary for the specific AI task).</li>
              </ul>
              <p className="mt-3">You may request a copy of the applicable transfer mechanisms by contacting <a href="mailto:privacy@maiprop.co" className="text-primary hover:underline">privacy@maiprop.co</a>.</p>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-foreground mb-3">8. Data Retention</h2>
              <p>We retain personal data only as long as necessary for the purposes for which it was collected, or as required by law:</p>
              <ul className="list-disc ml-6 mt-2 space-y-1">
                <li><strong>Account data:</strong> Retained for the duration of the account and for 5 years after closure (tax &amp; AML requirements);</li>
                <li><strong>Listing data:</strong> 7 years after a transaction (Greek tax law);</li>
                <li><strong>Messages &amp; communications:</strong> 3 years, unless a legal dispute requires longer retention;</li>
                <li><strong>Usage &amp; analytics data:</strong> 26 months in identifiable form, then anonymised;</li>
                <li><strong>Marketing consent records:</strong> Until consent is withdrawn plus 1 year;</li>
                <li><strong>Payment records:</strong> 10 years (Hellenic Accounting Standards / VAT law);</li>
                <li><strong>AI interaction logs:</strong> 90 days in identifiable form for safety &amp; abuse monitoring, then anonymised.</li>
              </ul>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-foreground mb-3">9. Your Rights Under GDPR</h2>
              <p>As a data subject, you have the following rights, exercisable free of charge via <a href="mailto:privacy@maiprop.co" className="text-primary hover:underline">privacy@maiprop.co</a>:</p>
              <ul className="list-disc ml-6 mt-2 space-y-2">
                <li><strong>Right of Access (Art. 15):</strong> Obtain confirmation of processing and a copy of your data within 30 days.</li>
                <li><strong>Right to Rectification (Art. 16):</strong> Correct inaccurate or incomplete data.</li>
                <li><strong>Right to Erasure / "Right to be Forgotten" (Art. 17):</strong> Request deletion of your data where we have no overriding legal basis to retain it.</li>
                <li><strong>Right to Restriction (Art. 18):</strong> Limit processing in specific circumstances (e.g., contested accuracy).</li>
                <li><strong>Right to Data Portability (Art. 20):</strong> Receive your data in a structured, machine-readable format (JSON/CSV).</li>
                <li><strong>Right to Object (Art. 21):</strong> Object to processing based on legitimate interests or for direct marketing (absolute right for marketing; we will stop immediately).</li>
                <li><strong>Rights Related to Automated Decision-Making (Art. 22):</strong> Our AI valuation and scoring tools support — not replace — human decisions. You may request human review of any AI-assisted recommendation.</li>
                <li><strong>Right to Withdraw Consent:</strong> Where processing is based on consent, you may withdraw at any time via account settings or by contacting us.</li>
                <li><strong>Right to Lodge a Complaint:</strong> You may lodge a complaint with the <strong>Hellenic Data Protection Authority (HDPA)</strong> at <a href="https://www.dpa.gr" target="_blank" rel="noreferrer" className="text-primary hover:underline">www.dpa.gr</a>, Kifissias 1-3, 11523 Athens, tel. +30 210 6475600.</li>
              </ul>
              <p className="mt-3">We will respond to verified requests within <strong>30 calendar days</strong> (extendable to 90 days for complex requests with notice).</p>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-foreground mb-3">10. Cookies & Tracking Technologies</h2>
              <p>We use cookies and similar technologies as detailed in our <a href="/cookie-policy" className="text-primary hover:underline">Cookie Policy</a>. You can manage your preferences via our cookie consent banner or browser settings. Declining non-essential cookies will not affect your ability to use core platform features.</p>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-foreground mb-3">11. AI & Machine Learning</h2>
              <p>Our platform uses AI/ML for property valuation, AI-powered search, neighbourhood analysis, smart filter suggestions, and property chat assistance. These systems:</p>
              <ul className="list-disc ml-6 mt-2 space-y-1">
                <li>Are trained on aggregated, anonymised real estate data — not on individual user profiles;</li>
                <li>May use your search queries and interaction data (in anonymised/pseudonymised form) to improve model performance;</li>
                <li>Do not make legally significant decisions about you without human oversight;</li>
                <li>Are subject to regular accuracy and bias audits.</li>
              </ul>
              <p className="mt-3">You may opt out of AI personalisation by contacting us. Opting out will not affect access to core listing features.</p>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-foreground mb-3">12. Security</h2>
              <p>We implement appropriate technical and organisational measures to protect your data, including:</p>
              <ul className="list-disc ml-6 mt-2 space-y-1">
                <li>TLS 1.3 encryption in transit; AES-256 encryption at rest;</li>
                <li>Role-based access control (RBAC) with least-privilege principles;</li>
                <li>Multi-factor authentication for staff systems;</li>
                <li>Regular penetration testing and vulnerability assessments;</li>
                <li>SOC 2 Type II compliant infrastructure providers;</li>
                <li>Incident response plan with 72-hour breach notification to HDPA (as required by Art. 33 GDPR).</li>
              </ul>
              <p className="mt-3">No system is 100% secure. If you suspect unauthorised access to your account, contact us immediately at <a href="mailto:security@maiprop.co" className="text-primary hover:underline">security@maiprop.co</a>.</p>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-foreground mb-3">13. Children's Privacy</h2>
              <p>Our platform is not directed at children under the age of 16. We do not knowingly collect personal data from minors. If we become aware that we have collected data from a child under 16 without parental consent, we will delete it promptly. If you believe we may have such data, contact us at <a href="mailto:privacy@maiprop.co" className="text-primary hover:underline">privacy@maiprop.co</a>.</p>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-foreground mb-3">14. Changes to This Policy</h2>
              <p>We may update this Policy from time to time. Material changes will be notified via email and/or a prominent notice on our platform at least <strong>30 days before</strong> they take effect. Your continued use of the platform after the effective date constitutes acceptance of the revised Policy. Historical versions are available on request.</p>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-foreground mb-3">15. Contact Us</h2>
              <p>For any privacy-related queries, to exercise your rights, or to raise a concern:</p>
              <ul className="list-disc ml-6 mt-2 space-y-1">
                <li>Email: <a href="mailto:privacy@maiprop.co" className="text-primary hover:underline">privacy@maiprop.co</a></li>
                <li>DPO: <a href="mailto:dpo@maiprop.co" className="text-primary hover:underline">dpo@maiprop.co</a></li>
                <li>Post: maiProp Ltd, Privacy Team, Kifissias Ave. 44, 15125 Athens, Greece</li>
                <li>Phone: +30 210 123 4567 (Mon–Fri, 09:00–17:00 EET)</li>
              </ul>
            </section>

          </div>
        </section>
      </div>
      <Footer />
    </div>
  );
}
