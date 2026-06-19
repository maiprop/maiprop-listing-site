# WCAG Manual Test Plan

Automated axe, Lighthouse, skip-link, image-alt, and homepage link-name checks catch regressions, but they do not prove full WCAG 2.2 conformance. Run this checklist before enterprise procurement review and after major UI changes.

| Flow | Viewport | Manual Check |
|---|---|---|
| Home and public search | 390px mobile, 1440px desktop | Keyboard tab order, visible focus, no horizontal overflow, accessible names for icon buttons |
| Listings and property cards | 390px mobile, 1440px desktop | Card controls reachable by keyboard, image alt text meaningful, no clipped price/title text |
| Property detail and new-build detail | 390px mobile, 1440px desktop | Gallery controls have names, map controls do not trap focus, headings are hierarchical |
| Open-house registration | 390px mobile, 1440px desktop | Modal focus trap, Escape closes modal, error messages are announced |
| Login and onboarding | 390px mobile, 1440px desktop | Labels associated with inputs, validation errors are visible and screen-reader discoverable |
| Dashboard and admin | 390px mobile, 1440px desktop | Sidebar navigation announces active state, tables/cards remain readable, destructive dialogs require confirmation |

Record the release SHA, browser, tester, screenshots, and defects in the release evidence bundle.
