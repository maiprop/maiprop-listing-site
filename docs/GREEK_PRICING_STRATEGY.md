# maiProp Pricing Strategy — Greek Market
**Research Date: March 2026**

> Historical strategy note. Current implemented billing lives in
> `docs/PRICING_MATRIX.md`, `scripts/setup-stripe-catalog.mjs`, and
> `pricing_configs`.

---

## 1. Greek Real Estate Market Context

| Metric | Value |
|---|---|
| Residential transactions (2024) | 145,765 |
| YoY growth | +7.3% |
| Average Athens apartment price | €2,100–2,400/m² |
| Average agent commission | 2–3% (buyer + seller) |
| Average agent monthly salary | ~€2,020 gross |
| Average notary fee | 1–1.5% of transaction |
| VAT on services | 24% |

**Key insight for pricing:** Greeks are skeptical of recurring SaaS subscriptions. They ask "what do I get for this money?" before "how much does it cost?" ROI framing ("one below-market deal saves you more than 10 years of fees") converts better than feature lists.

---

## 2. Competitor Pricing (2025-2026)

| Portal | Price model | Price range |
|---|---|---|
| Spitogatos | Per-listing + subscription | €100–300/mo for agents |
| xe.gr | Per-listing | From €11/listing |
| Plot.gr | Subscription | ~€80–150/mo |
| Homegate (CH, benchmark) | Tiered subscription | CHF 99–399/mo |
| Idealista (ES, benchmark) | Tiered subscription | €49–199/mo |

**Gap:** No Greek portal offers a genuinely free-first model with strong progressive unlocks. This is the market opportunity for maiProp.

---

## 3. Pricing Principles for the Greek Market

1. **Free must be meaningful** — Greeks will not sign up for a "free" account that does nothing. The free tier must let an agent post 5 real listings, receive messages, and get basic leads. If free = useless, nobody signs up and the network never grows.

2. **ROI framing, not feature lists** — Don't say "unlimited listings." Say "list every property in your portfolio — no per-listing fees eating your commission." Don't say "AI valuation." Say "know the real value before your client negotiates."

3. **Annual billing incentive** — Greeks prefer to pay once a year vs. monthly recurring. 2 months free on annual = ~16.7% discount, which feels significant.

4. **Trial before commitment** — 7-day free trial on self-serve Pro plans, with card collection required before activation.

5. **Quick Sale / Investor access is ROI-justified standalone** — A distressed deal at 30–50% below market saves €50,000–200,000+ on a typical Athens property. An annual pass at €249–499 is a trivial cost vs. the upside. Frame as "access fee," not "subscription."

---

## 4. Recommended Price Points

### Participant (Buyer / Seller / Renter)

| Plan | Price | Key rationale |
|---|---|---|
| Free | €0 | Network growth — more buyers = more value for agents/sellers |
| Pro | €19/month (€190/yr) | Coffee-price framing. AI valuations, reports, pro auction access |

**Quick Sale Investor Pass** (separate standalone):
- **€299/year** — Access to pre-market Quick Sale opportunities + priority matching with maiProp OS deals
- Frame: "One below-market acquisition saves you more than 30 years of this pass"
- This is NOT included in the €19/mo Pro plan — it is a distinct high-value tier

### Agent / Independent Agent

| Plan | Price | Key rationale |
|---|---|---|
| Free | €0 | Up to 5 listings — enough to test, not enough to run a business |
| Active | €49/month (€490/yr) | Unlimited listings + AI assist — replaces xe.gr per-listing cost |
| Pro | €99/month (€990/yr) | CRM + analytics + priority ads + auction alerts |

**Framing vs. competitor:** An agent posting 10 listings/month on xe.gr pays €110+. maiProp Active at €49/mo saves money from day 1.

### Agency (Multi-seat)

| Plan | Price | Key rationale |
|---|---|---|
| Team (up to 5 agents) | €149/month | Better than 3 individual Active subscriptions |
| Agency (up to 15 agents) | €299/month | Mid-sized Greek agencies |
| Enterprise | €499/month | Large networks, white-label options, API access |

### Developer / Builder

| Plan | Price | Key rationale |
|---|---|---|
| Pro (Pro-only, no free) | €89/month (€890/yr) | Project showcases, pre-sales, new builds section |

**7-day free trial** — Developers are high-value; reduce friction to try.

### Service Professional (Lawyer, Architect, Notary, etc.)

| Plan | Price | Key rationale |
|---|---|---|
| Free | €0 | Directory listing, receive lead inquiries |
| Pro | €49/month (€490/yr) | Priority placement, booking calendar, AI matching |

**Greek notary/lawyer framing:** One additional client from maiProp directory = €500–2,000+ in fees. Monthly cost = trivial ROI.

---

## 5. Quick Sale / Investor Access — Premium Positioning

The Quick Sale offering (discounted distressed property deals) must NOT be bundled into low-tier subscriptions. Rationale:

1. **Deal quality depends on scarcity** — if everyone has access, the best deals disappear before serious investors see them
2. **maiProp OS routing** — most deals flow from the OS data ecosystem; this is the core data moat
3. **High-value buyer segment** — investors who buy below market are repeat buyers and high-LTV customers
4. **Monetization leverage** — charging €299-499/yr for exclusive deal flow is defensible and hard to commoditize

**Implementation:**
- Quick Sale Application Form (for sellers submitting distressed properties) remains free to submit — this is lead acquisition
- Access to **view and bid on** Quick Sale listings requires the Investor Access Pass
- Deals are first offered to maiProp OS users, then to Investor Pass holders
- ProGate on the Quick Sale listing feed for non-pass holders: "Exclusive investor deals — from €299/year"

---

## 6. Psychological Pricing Tactics for Greeks

| Tactic | Implementation |
|---|---|
| Anchoring | Show per-listing cost comparison (xe.gr: €11/listing = €110/mo for 10 listings vs. maiProp Active: €49/mo unlimited) |
| Loss framing | "Every day without auction alerts is a deal you didn't see" |
| Social proof | "472 agents in Greece use maiProp Pro" |
| Annual savings badge | Show "Save €198/year" prominently on annual billing toggle |
| Free trial with no credit card | Lower commitment barrier — require card only at checkout |
| ROI calculator | "How many transactions per year? Average commission? → Your break-even: X days" |

---

## 7. What NOT to Do

- **Don't price too low** — Under-pricing signals low value. €19/mo for participants is already at the floor.
- **Don't hide pricing** — Greeks distrust sites without visible pricing. Show prices prominently.
- **Don't require annual commitment upfront** — Offer monthly first; annual upsell after 2-3 months.
- **Don't use English SaaS framing** ("Starter / Growth / Enterprise") — Greeks respond to concrete, tangible language ("5 listings free", "unlimited listings", "priority in search results").

---

## 8. Implementation Priority

1. ✅ Quick Sale access as a standalone high-value offering (not in base Pro)
2. ✅ Agent pricing: Free (5 listings) → Active (€49) → Pro (€99)
3. ✅ Participant Pro at €19/mo (ROI: AI valuations + reports)
4. Professional Pro at €49/mo
5. Agency multi-seat tiers (€149 / €299 / €499) — when agent base grows
6. Annual billing discount (2 months free) — currently monthly only
7. ROI calculator widget on Pricing page
8. Per-deal access option for Quick Sale (€25/deal preview) — as alternative to annual pass

---

## 9. Actual Implemented Pricing (April 2026)

> **Note:** This document reflects March 2026 strategy recommendations. The actual implemented pricing differs:
>
> | Plan | Strategy (This Doc) | Actual (Implemented) |
> |------|---------------------|-------------------|
> | Participant Pro | EUR 19/mo | EUR 29/mo |
> | Agent Pro | EUR 49/mo | EUR 149/mo |
> | Developer Pro | EUR 89/mo | EUR 129/mo |
> | Professional Pro | EUR 49/mo | EUR 69/mo |
> | Investor Plan | Invite-only | Custom annual link |
> | Institutional Plan | Invite-only | Custom annual link |
>
> See `docs/PRICING_MATRIX.md` and `MAIPROP_PLATFORM_REFERENCE.md` for current pricing.
