# DORA Incident Reporting Taxonomy

| Severity | DORA incident criteria | Regulatory clock | Customer notice | Examples |
|---|---|---|---|---|
| SEV1 | Complete service outage, confirmed data exposure, or payment/security control failure | Start when incident commander confirms material impact | Immediate status update after impact is known | Portal down, tenant data exposure, service role exposure |
| SEV2 | Major business workflow unavailable or degraded for a material user group | Start when impact crosses SLO threshold | Within the same business day | Payments failing, listing creation broken, auth login outage |
| SEV3 | Localized degradation with workaround | Track internally; escalate if duration/impact grows | Status page or targeted notice if customer-visible | AI valuation slow, map provider degraded |
| SEV4 | Non-production or cosmetic issue | No regulatory clock | No customer notice unless requested | CI flaky, doc error |

Every incident record must include timeline, root cause, control failure, customer impact, data impact, containment, recovery, and action items.
