import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Cookie } from "lucide-react";

export default function CookiePolicy() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-16">
        <section className="py-16 container max-w-4xl">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
              <Cookie className="w-5 h-5 text-accent" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Legal</p>
              <h1 className="font-display text-3xl font-bold">Cookie Policy</h1>
            </div>
          </div>
          <p className="text-muted-foreground mb-10">Last updated: 9 March 2026 · This policy explains how maiProp uses cookies and similar technologies.</p>

          <div className="prose prose-invert max-w-none space-y-10 text-sm leading-relaxed text-foreground/85">

            <section>
              <h2 className="font-display text-xl font-bold text-foreground mb-3">1. What Are Cookies?</h2>
              <p>Cookies are small text files placed on your device when you visit a website. They allow the website to recognise your device, remember your preferences, and provide certain features. Cookies may be "<strong>session cookies</strong>" (deleted when you close your browser) or "<strong>persistent cookies</strong>" (stored on your device until they expire or are deleted).</p>
              <p className="mt-3">We also use <strong>similar technologies</strong> such as web beacons (clear GIFs), pixel tags, local storage (localStorage/sessionStorage), and fingerprinting-resistant analytics scripts. For simplicity, we refer to all of these collectively as "cookies" in this Policy.</p>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-foreground mb-3">2. Legal Framework</h2>
              <p>Our cookie practices comply with:</p>
              <ul className="list-disc ml-6 mt-2 space-y-1">
                <li>The <strong>EU ePrivacy Directive (2002/58/EC)</strong> as implemented by Greek Law 3674/2008 (as amended);</li>
                <li>The <strong>GDPR (EU) 2016/679</strong> for cookies that process personal data;</li>
                <li>The <strong>Hellenic Data Protection Authority (HDPA)</strong> guidelines on cookies (November 2020 &amp; January 2023);</li>
                <li>The EU Court of Justice ruling in <em>Planet49</em> (C-673/17): consent must be specific, informed, unambiguous, and freely given — pre-ticked boxes are not valid consent.</li>
              </ul>
              <p className="mt-3">We require your <strong>explicit, opt-in consent</strong> before setting any non-strictly-necessary cookies. You may withdraw that consent at any time.</p>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-foreground mb-3">3. Categories of Cookies We Use</h2>

              <h3 className="font-semibold text-base text-foreground mt-5 mb-2">3.1 Strictly Necessary Cookies</h3>
              <p>These are essential for the Platform to function. They cannot be disabled. They include:</p>
              <div className="overflow-x-auto mt-3">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 pr-4 font-semibold text-foreground">Cookie Name</th>
                      <th className="text-left py-2 pr-4 font-semibold text-foreground">Purpose</th>
                      <th className="text-left py-2 font-semibold text-foreground">Duration</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {[
                      ["sb-auth-token", "Supabase authentication session token — keeps you logged in", "Session (1 hour, refreshed automatically)"],
                      ["sb-refresh-token", "Refresh token for renewing your authentication session without re-login", "7 days"],
                      ["maiprop-csrf", "Cross-Site Request Forgery protection token for form submissions", "Session"],
                      ["maiprop-consent", "Stores your cookie consent preferences", "1 year"],
                      ["maiprop-theme", "Remembers your light/dark theme preference", "1 year"],
                    ].map(([name, purpose, duration]) => (
                      <tr key={name}>
                        <td className="py-2 pr-4 font-mono text-primary text-[11px]">{name}</td>
                        <td className="py-2 pr-4 text-muted-foreground">{purpose}</td>
                        <td className="py-2 text-muted-foreground">{duration}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <h3 className="font-semibold text-base text-foreground mt-6 mb-2">3.2 Functional Cookies</h3>
              <p>These enhance your experience but are not strictly necessary. Enabled only with your consent.</p>
              <div className="overflow-x-auto mt-3">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 pr-4 font-semibold text-foreground">Cookie Name</th>
                      <th className="text-left py-2 pr-4 font-semibold text-foreground">Purpose</th>
                      <th className="text-left py-2 font-semibold text-foreground">Duration</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {[
                      ["maiprop-recent-searches", "Stores your recent search queries for quick access", "30 days"],
                      ["maiprop-map-prefs", "Saves your map view, zoom level, and layer preferences", "90 days"],
                      ["maiprop-filter-prefs", "Remembers your last used listing filters", "30 days"],
                      ["maiprop-language", "Stores your language preference (EN/EL)", "1 year"],
                      ["maiprop-compare", "Temporarily saves properties you've added to comparison", "Session"],
                    ].map(([name, purpose, duration]) => (
                      <tr key={name}>
                        <td className="py-2 pr-4 font-mono text-primary text-[11px]">{name}</td>
                        <td className="py-2 pr-4 text-muted-foreground">{purpose}</td>
                        <td className="py-2 text-muted-foreground">{duration}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <h3 className="font-semibold text-base text-foreground mt-6 mb-2">3.3 Analytics Cookies</h3>
              <p>Used to understand how the Platform is used so we can improve it. Enabled only with your consent. All data is pseudonymised; IP addresses are truncated before storage.</p>
              <div className="overflow-x-auto mt-3">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 pr-4 font-semibold text-foreground">Provider</th>
                      <th className="text-left py-2 pr-4 font-semibold text-foreground">Purpose</th>
                      <th className="text-left py-2 font-semibold text-foreground">Duration</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {[
                      ["PostHog (self-hosted EU)", "Product analytics — page views, feature usage, funnels. Data hosted in EU.", "1 year"],
                      ["Mixpanel (EU cluster)", "Event tracking for platform improvements. IP anonymisation enabled.", "1 year"],
                      ["Hotjar (optional)", "Session recordings and heatmaps for UX research. Only activated when explicitly opted in.", "365 days"],
                    ].map(([provider, purpose, duration]) => (
                      <tr key={provider}>
                        <td className="py-2 pr-4 font-medium text-foreground">{provider}</td>
                        <td className="py-2 pr-4 text-muted-foreground">{purpose}</td>
                        <td className="py-2 text-muted-foreground">{duration}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <h3 className="font-semibold text-base text-foreground mt-6 mb-2">3.4 Mapping Cookies</h3>
              <p>Our interactive maps are powered by <strong>Mapbox</strong>. When you use map features, Mapbox may set cookies to optimise tile loading performance. These cookies do not track your location outside the Platform. Enabled only when you interact with map features.</p>
              <div className="overflow-x-auto mt-3">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 pr-4 font-semibold text-foreground">Provider</th>
                      <th className="text-left py-2 pr-4 font-semibold text-foreground">Purpose</th>
                      <th className="text-left py-2 font-semibold text-foreground">Duration</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {[
                      ["Mapbox", "Map tile caching, user interaction telemetry for map performance", "1 year"],
                    ].map(([provider, purpose, duration]) => (
                      <tr key={provider}>
                        <td className="py-2 pr-4 font-medium text-foreground">{provider}</td>
                        <td className="py-2 pr-4 text-muted-foreground">{purpose}</td>
                        <td className="py-2 text-muted-foreground">{duration}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <h3 className="font-semibold text-base text-foreground mt-6 mb-2">3.5 Marketing & Retargeting Cookies</h3>
              <p>We do <strong>not</strong> currently use third-party advertising or retargeting cookies on the Platform. If we introduce such cookies in the future, this Policy will be updated and your consent will be sought before any marketing cookies are set.</p>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-foreground mb-3">4. Third-Party Embeds</h2>
              <p>Certain pages on our Platform embed external websites (e.g., os.maiprop.co, properties.maiprop.co) within iframes. These embedded sites may set their own cookies subject to their own privacy and cookie policies. We recommend reviewing the applicable policies for those sites. We do not control cookies set by third-party iframes.</p>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-foreground mb-3">5. How to Manage Your Cookie Preferences</h2>
              <p>You can control cookies in several ways:</p>

              <h3 className="font-semibold text-base text-foreground mt-4 mb-2">5.1 Our Consent Banner</h3>
              <p>When you first visit the Platform, a consent banner allows you to accept or reject non-essential cookie categories. You can change your preferences at any time by clicking "<strong>Cookie Settings</strong>" in the footer.</p>

              <h3 className="font-semibold text-base text-foreground mt-4 mb-2">5.2 Browser Settings</h3>
              <p>You can set your browser to block or delete cookies. Note that blocking strictly necessary cookies may prevent the Platform from functioning correctly. Browser-specific instructions:</p>
              <ul className="list-disc ml-6 mt-2 space-y-1">
                <li><a href="https://support.google.com/chrome/answer/95647" target="_blank" rel="noreferrer" className="text-primary hover:underline">Google Chrome</a></li>
                <li><a href="https://support.mozilla.org/en-US/kb/enhanced-tracking-protection-firefox-desktop" target="_blank" rel="noreferrer" className="text-primary hover:underline">Mozilla Firefox</a></li>
                <li><a href="https://support.apple.com/en-gb/guide/safari/sfri11471/mac" target="_blank" rel="noreferrer" className="text-primary hover:underline">Apple Safari</a></li>
                <li><a href="https://support.microsoft.com/en-us/windows/manage-cookies-in-microsoft-edge" target="_blank" rel="noreferrer" className="text-primary hover:underline">Microsoft Edge</a></li>
              </ul>

              <h3 className="font-semibold text-base text-foreground mt-4 mb-2">5.3 Opt-Out Tools</h3>
              <ul className="list-disc ml-6 mt-2 space-y-1">
                <li><a href="https://posthog.com/docs/privacy" target="_blank" rel="noreferrer" className="text-primary hover:underline">PostHog opt-out</a></li>
                <li><a href="https://mixpanel.com/optout/" target="_blank" rel="noreferrer" className="text-primary hover:underline">Mixpanel opt-out</a></li>
                <li><a href="https://www.hotjar.com/policies/do-not-track/" target="_blank" rel="noreferrer" className="text-primary hover:underline">Hotjar opt-out</a></li>
              </ul>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-foreground mb-3">6. Do Not Track</h2>
              <p>Some browsers transmit "Do Not Track" (DNT) signals. We honour DNT signals to the extent technically feasible — when DNT is enabled, we will not set analytics or functional cookies without your explicit consent via our banner. Note that strictly necessary cookies are exempt from DNT.</p>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-foreground mb-3">7. Cookie Consent Records</h2>
              <p>We keep a record of your consent choices (what you consented to, when, and what version of this Policy was in effect). This record is retained for 1 year after your last consent interaction. You can request a copy of your consent record at <a href="mailto:privacy@maiprop.co" className="text-primary hover:underline">privacy@maiprop.co</a>.</p>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-foreground mb-3">8. Changes to This Policy</h2>
              <p>We update this Policy when we add, remove, or change cookies. Material changes will be communicated via our consent banner, and we will re-request consent where required. The version date at the top of this page always reflects the latest update.</p>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-foreground mb-3">9. Contact</h2>
              <p>For questions about our use of cookies or to exercise your rights: <a href="mailto:privacy@maiprop.co" className="text-primary hover:underline">privacy@maiprop.co</a> · maiProp Ltd, Kifissias Ave. 44, 15125 Athens, Greece.</p>
              <p className="mt-2">To lodge a complaint: <strong>Hellenic Data Protection Authority (HDPA)</strong>, <a href="https://www.dpa.gr" target="_blank" rel="noreferrer" className="text-primary hover:underline">www.dpa.gr</a>, +30 210 6475600.</p>
            </section>

          </div>
        </section>
      </div>
      <Footer />
    </div>
  );
}
