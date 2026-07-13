# Cloudflare DNS Posture

## Current Decision

`maiprop.co` intentionally retains registrar-authoritative DNS. Cloudflare
Pages hosts `portal.maiprop.co`, but the Cloudflare zone is not authoritative.
This avoids an unreviewed migration of apex, `www`, Google Workspace mail,
SPF/DKIM, and other verification records.

Capture this posture with:

```powershell
$env:CLOUDFLARE_DNS_MODE = "registrar"
$env:CLOUDFLARE_ZONE_ID = "<zone-id>"
node scripts/capture-cloudflare-admin-posture.mjs --strict
```

The resulting evidence must set `zoneSecurityControlsClaimed` to `false` and
list the registrar-DNS limitations. Pages HTTPS and deployment evidence are
independent of zone authority.

## Nameserver Migration Gate

Do not change nameservers until all of these are complete:

1. Export the authoritative registrar zone and compare every apex, `www`,
   portal, MX, SPF, DKIM, DMARC, verification, and service record with the
   Cloudflare candidate zone.
2. Mark mail and verification CNAME records DNS-only where proxying would break
   provider validation.
3. Lower DNS TTLs at least 24 hours before the approved migration window.
4. Enable minimum TLS 1.2, Always Use HTTPS, WAF rules, rate limits, and the
   intended bot posture in Cloudflare before delegation.
5. Obtain a rollback window and registrar access, then record old and new
   nameservers.
6. After delegation, verify DNSSEC, mail delivery, `portal`, apex, `www`,
   certificate issuance, Pages deployment, API routes, and webhook endpoints.
7. Roll back to registrar nameservers if any critical path fails within the
   approved window.

Until that gate is executed, ECAS must score Cloudflare zone controls as not
verified rather than inheriting them from the Pages deployment.
