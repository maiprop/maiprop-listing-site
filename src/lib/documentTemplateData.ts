// Document template data — extracted from DocumentTemplates.tsx

export const TEMPLATES = [
  // ── Sale ──
  {
    id: "preliminary-purchase",
    category: "sale",
    name: "Preliminary Purchase Agreement",
    nameEl: "Προσύμφωνο Πώλησης",
    description:
      "Binding pre-contract securing a property sale with deposit terms before the final notarial deed.",
    languages: ["Greek", "English"] as string[],
    format: "DOCX",
    content: `PRELIMINARY PURCHASE AGREEMENT
(ΠΡΟΣΥΜΦΩΝΟ ΠΩΛΗΣΗΣ)

Dated: [DD/MM/YYYY]

PARTIES
-------
Seller: [Full Legal Name], ID No. [XXXX], Tax No. (ΑΦΜ): [XXXXXXXXX],
        residing at [Full Address], represented by [Notary/Lawyer if applicable].

Buyer:  [Full Legal Name], ID No. [XXXX], Tax No. (ΑΦΜ): [XXXXXXXXX],
        residing at [Full Address].

PROPERTY DESCRIPTION
--------------------
Property: [Full address, floor/apartment number, municipality]
Cadastral Reference (ΚΑΕΚ): [XX/XX/XX/XXXXX/X/X]
Land Registry Office: [Municipality] Land Registry, Volume [X], Folio [X]
Area: [XXX] sq m (as per architectural drawings attached hereto as Annex A)
Building Year: [YYYY]
Energy Rating: [A+/A/B/C/D/E/Z]

FINANCIAL TERMS
---------------
Purchase Price: € [Amount] (Euro [Amount in Words])
  - Deposit (Προκαταβολή / Αρραβώνας): 10% = € [Deposit Amount]
    Payable upon signing of this Agreement by bank transfer to:
    IBAN: [GR XX XXXX XXXX XXXX XXXX XXXX XXX]
  - Balance: € [Balance Amount] payable at completion

COMPLETION
----------
Final notarial deed (Συμβόλαιο) to be executed within [X] days / by [DD/MM/YYYY]
at the offices of Notary [Name], [Address], Athens.

TERMS AND CONDITIONS
--------------------
1. TITLE & ENCUMBRANCES
   The Seller represents and warrants that the Property is owned outright, free
   of mortgages (υποθήκες), prenotations (προσημειώσεις), liens, easements,
   third-party claims, or any legal encumbrances, as confirmed by a fresh
   certificate from the competent Land Registry / Cadastre (Κτηματολόγιο).

2. PLANNING COMPLIANCE
   The Seller warrants that the Property conforms to all applicable urban
   planning regulations (πολεοδομικές διατάξεις) and that no illegal
   constructions (αυθαίρετα) exist, or that any such constructions have been
   legalised under Law 4495/2017 (Τακτοποίηση Αυθαιρέτων).

3. TAX CLEARANCE
   The Seller shall provide, no later than [X] business days before completion:
   (a) Tax clearance certificate (Φορολογική Ενημερότητα) from AADE;
   (b) Proof that all Transfer Tax (Φόρος Μεταβίβασης) obligations are settled;
   (c) ENFIA (Ενιαίος Φόρος Ιδιοκτησίας) clearance for current year.

4. ENERGY CERTIFICATE
   The Seller shall provide a valid Energy Performance Certificate (ΠΕΑ) issued
   by a licensed energy inspector no earlier than 10 years before transfer date.

5. LEGAL REPRESENTATION
   Each party shall be represented by a licensed Greek lawyer (δικηγόρος) at
   the completion signing. Lawyer fees are borne by the respective party.

6. NOTARY FEES & TRANSFER TAX
   Notary fees and Transfer Tax (currently 3% of the objective value / agreed
   price, whichever is higher) are borne by the Buyer, unless otherwise agreed.

7. DEFAULT
   (a) If the Buyer defaults, the Seller retains the deposit as liquidated damages.
   (b) If the Seller defaults, the Seller must return double the deposit amount
       to the Buyer within [X] business days.

8. GOVERNING LAW & JURISDICTION
   This Agreement is governed by Greek law. Any disputes shall be submitted to
   the exclusive jurisdiction of the courts of Athens, Greece.

9. SIGNATURES
   Executed in two (2) originals, one for each party.

   Seller: ________________________   Date: ____________

   Buyer:  ________________________   Date: ____________

   Witness: _______________________   Date: ____________
   [Lawyer / Notary stamp and signature]

ANNEX A — Architectural floor plan
ANNEX B — Land Registry Certificate (Πιστοποιητικό Κτηματολογίου)
ANNEX C — Energy Performance Certificate (ΠΕΑ)
`,
  },
  {
    id: "letter-of-intent",
    category: "sale",
    name: "Letter of Intent (LoI) — Buyer to Seller",
    nameEl: "Επιστολή Πρόθεσης Αγοράς",
    description:
      "Non-binding expression of interest from buyer, outlining proposed price and conditions.",
    languages: ["English"] as string[],
    format: "DOCX",
    content: `LETTER OF INTENT — PROPERTY ACQUISITION

Date: [DD/MM/YYYY]

To:   [Seller Full Name / Company]
      [Seller Address]

From: [Buyer Full Name / Company]
      [Buyer Address]

Re:   Expression of Interest — [Property Address], [Municipality], Greece

Dear [Seller Name],

This Letter of Intent ("LoI") sets out the proposed terms under which
[Buyer Name] ("the Buyer") intends to acquire the above-referenced property
("the Property") from [Seller Name] ("the Seller").

THIS LoI IS NON-BINDING on both parties and does not constitute a legally
enforceable agreement. It is intended solely to facilitate good-faith
negotiations towards a formal Preliminary Purchase Agreement (Προσύμφωνο).

PROPOSED TERMS
--------------
1. Purchase Price: € [Amount] (Euro [Amount in Words])
   Subject to satisfactory due diligence and survey results.

2. Deposit: 10% of the purchase price payable upon execution of the
   Preliminary Purchase Agreement (Προσύμφωνο Πώλησης).

3. Due Diligence Period: [X] calendar days from date of this LoI,
   during which the Buyer shall conduct title searches, surveys, and
   legal checks. The Seller agrees to provide full access and
   documentation within this period.

4. Completion: Final notarial deed to be executed within [X] days
   after expiry of the due diligence period, subject to satisfactory
   completion of all checks.

5. Conditions Precedent:
   (a) Clear title confirmed by Land Registry (Κτηματολόγιο) search;
   (b) No outstanding ENFIA or Transfer Tax liabilities;
   (c) Structural survey report satisfactory to the Buyer;
   (d) Planning compliance certificate (Βεβαίωση Πολεοδομίας);
   (e) Valid Energy Performance Certificate (ΠΕΑ) provided.

6. Exclusivity: The Seller agrees not to negotiate with or accept
   offers from third parties for a period of [X] days from the
   date of this LoI ("Exclusivity Period"). If no agreement is
   reached within the Exclusivity Period, both parties are free
   to pursue other opportunities.

7. Costs: Each party shall bear its own legal and professional fees.
   Transfer Tax and notary fees to be borne by the Buyer.

8. Governing Law: Greek law (Civil Code Art. 197–198 on pre-contractual
   liability shall apply).

NEXT STEPS
----------
If the above terms are acceptable in principle, the Seller is invited
to countersign this LoI and return a copy to the Buyer, whereupon
the due diligence period shall commence immediately.

Yours sincerely,

[Buyer Name]
[Buyer Title / Company]
[Contact Details]

Acknowledged and agreed (non-binding):

[Seller Name]: ________________________   Date: ____________
`,
  },
  {
    id: "property-transfer",
    category: "sale",
    name: "Property Transfer Agreement (Outline)",
    nameEl: "Σύμβαση Μεταβίβασης Ακινήτου",
    description:
      "Framework outline for the notarial deed of transfer — to be completed by a licensed Greek notary.",
    languages: ["Greek", "English"] as string[],
    format: "PDF",
    content: `PROPERTY TRANSFER AGREEMENT — OUTLINE TEMPLATE
(ΣΥΜΒΑΣΗ ΜΕΤΑΒΙΒΑΣΗΣ ΑΚΙΝΗΤΟΥ — ΣΧΕΔΙΟ)

NOTE: This is a structural outline only. The final deed (Συμβόλαιο)
must be drafted and notarised by a licensed Greek Notary (Συμβολαιογράφος)
in accordance with Articles 369 et seq. of the Greek Civil Code.

═══════════════════════════════════════════════
NOTARIAL DEED OF TRANSFER OF REAL PROPERTY
File No.: [XXXX/YYYY] of the Notarial Registry of [City]
═══════════════════════════════════════════════

PREAMBLE
--------
In [City], on [DD/MM/YYYY], before me, [Notary Full Name],
Notary Public of [City] (Licence No. [XXXX]), appeared:

SELLER: [Full Name], born [DD/MM/YYYY], national ID [XXXX],
        ΑΦΜ [XXXXXXXXX], ΔΟΥ [Tax Office], resident of [Address].

BUYER:  [Full Name], born [DD/MM/YYYY], national ID [XXXX],
        ΑΦΜ [XXXXXXXXX], ΔΟΥ [Tax Office], resident of [Address].

RECITALS
--------
A. The Seller is the sole registered owner of the Property described below,
   holding title by virtue of [previous deed reference].
B. The Seller wishes to sell and the Buyer wishes to purchase the Property
   on the terms set out herein.
C. Transfer Tax of € [Amount] has been paid as per payment receipt
   No. [XXXX] dated [DD/MM/YYYY] from ΔΟΥ [Tax Office].

THE PROPERTY
------------
Address:        [Full street address, floor, apartment no.]
Municipality:   [Δήμος], Prefecture: [Περιφέρεια]
Cadastral Ref.: ΚΑΕΚ [XX/XX/XX/XXXXX/X/X]
Area:           [XXX] sq m (net); [XXX] sq m (gross)
Boundaries:     North: [description]; South: [description];
                East: [description]; West: [description]

TRANSFER TERMS
--------------
1. Purchase Price: € [Amount] — received in full prior to this deed.
2. Title passes to the Buyer upon registration at the Cadastre / Land Registry.
3. Seller warrants clear title free of all encumbrances (Art. 513 GCC).
4. Risk passes to the Buyer upon execution of this deed.

REPRESENTATIONS
---------------
1. The Seller declares no unpaid ENFIA, Transfer Tax, or municipal levies exist.
2. The Seller declares no planning violations (or that all are legalised).
3. The energy certificate (ΠΕΑ) No. [XXXX] is attached as Annex I.

REGISTRATION
------------
This deed shall be registered at the [City] Cadastral Office / Land Registry
within [X] days by the Buyer's lawyer at the Buyer's cost.

Signed before me, the Notary:

Seller: ________________________

Buyer:  ________________________

Notary: ________________________ [Seal]
`,
  },
  {
    id: "due-diligence",
    category: "sale",
    name: "Due Diligence Checklist",
    nameEl: "Λίστα Ελέγχου Δέουσας Επιμέλειας",
    description:
      "Comprehensive checklist for legal, technical, and financial due diligence on Greek property.",
    languages: ["English"] as string[],
    format: "DOCX",
    content: `GREEK PROPERTY — DUE DILIGENCE CHECKLIST

Property: [Address]                          Date: [DD/MM/YYYY]
Buyer: [Name]                                Lawyer: [Name]

SECTION 1 — TITLE & LAND REGISTRY
□ Land Registry (Κτηματολόγιο) search certificate (within 30 days)
□ Full ownership history (chain of title) for minimum 20 years
□ Confirm no mortgages (υποθήκες) or prenotations (προσημειώσεις)
□ Confirm no easements (δουλείες) affecting use
□ Confirm no pending court actions or disputes (αγωγές)
□ Expropriation check (απαλλοτρίωση) — municipal & state records
□ Pre-emption rights check (δικαίωμα προτίμησης)

SECTION 2 — PLANNING & BUILDING PERMITS
□ Building permit (Άδεια Οικοδομής) — original and amendments
□ Certificate of completion / occupancy (Πιστοποιητικό Αυτοψίας)
□ Planning compliance certificate (Βεβαίωση Πολεοδομίας / ΥΔΟ)
□ Confirm property is within town plan (εντός σχεδίου / εκτός)
□ Confirm permitted land uses (χρήσεις γης) — residential / commercial
□ Check for illegal constructions (αυθαίρετα)
   - If found: confirm legalisation under Law 4495/2017 or 4759/2020
   - Obtain legalisation certificate and suspension of fine certificate
□ Seismic zone classification (Αντισεισμική Ικανότητα) check
□ Forest registry (Δασολόγιο) clearance — confirm not forest land
□ Archaeological zone check (Αρχαιολογικός Χώρος)
□ Coastal zone / shore restriction check (Αιγιαλός & Παραλία)

SECTION 3 — TAX COMPLIANCE
□ ENFIA (Ενιαίος Φόρος Ιδιοκτησίας) — paid receipts last 5 years
□ Tax clearance certificate (Φορολογική Ενημερότητα) — Seller
□ Transfer Tax (Φόρος Μεταβίβασης) calculation confirmed with ΔΟΥ
□ Objective value (Αντικειμενική Αξία) certificate from AADE
□ VAT status confirmed (does NOT apply to second-hand residential)
□ Capital Gains Tax assessment (if applicable under Law 4172/2013)

SECTION 4 — UTILITIES & SERVICE CHARGES
□ Electricity bill (ΔΕΗ) — no outstanding arrears
□ Water bill (ΕΥΔΑΠ / local utility) — no outstanding arrears
□ Natural gas bill — no outstanding arrears
□ Municipal levy (Δημοτικά Τέλη) — clearance certificate
□ Building management fees (Διαχειριστικά) — if apartment — clearance
□ Communal fund balance (Ταμείο Οικοδομής) — positive / zero

SECTION 5 — TECHNICAL SURVEY
□ Structural survey by certified civil engineer
□ Asbestos check (pre-1990 buildings)
□ Electrical installation certificate (Υπεύθυνη Δήλωση ΔΕΗ)
□ Plumbing & drainage inspection
□ Roof condition assessment
□ Window/insulation condition assessment
□ Heating system inspection and service records

SECTION 6 — ENERGY
□ Energy Performance Certificate (ΠΕΑ) — valid, by certified inspector
□ Confirm rating meets minimum threshold if financing required

SECTION 7 — BUILDING / STRATA
□ Condominium rules (Κανονισμός Πολυκατοικίας) — reviewed
□ Confirm parking/storage allocation (if applicable)
□ Confirm no major repair works pending (lifts, roof, facade)
□ Minutes of last 3 general meetings of owners reviewed

SECTION 8 — IDENTITY & ANTI-MONEY LAUNDERING
□ Seller ID verified (national ID / passport)
□ Proof of funds or mortgage pre-approval — Buyer
□ AML declaration signed by both parties
□ PEP (Politically Exposed Person) check — if required
□ Origin of funds declared and evidenced

SIGN-OFF
--------
Lawyer: ________________________   Date: ____________
Notes: [any flagged issues or pending items]
`,
  },

  // ── Rental ──
  {
    id: "residential-lease",
    category: "rental",
    name: "Residential Lease Agreement",
    nameEl: "Μισθωτήριο Συμβόλαιο Κατοικίας",
    description:
      "Standard Greek residential tenancy agreement compliant with Law 1703/1987 and 4591/2019.",
    languages: ["Greek", "English"] as string[],
    format: "DOCX",
    content: `RESIDENTIAL LEASE AGREEMENT
(ΜΙΣΘΩΤΗΡΙΟ ΣΥΜΒΟΛΑΙΟ ΚΑΤΟΙΚΙΑΣ)

Dated: [DD/MM/YYYY]

PARTIES
-------
Landlord (Εκμισθωτής):
  [Full Name], ΑΦΜ [XXXXXXXXX], ID [XXXX],
  Address: [Full Address]
  Bank IBAN for rent payments: GR [XXXXXXXXXXXXXXXXXXXX]

Tenant (Μισθωτής):
  [Full Name], ΑΦΜ [XXXXXXXXX], ID [XXXX],
  Address: [Full Address (current)]

PROPERTY
--------
Address:        [Full address, floor, apartment]
Type:           Apartment / House / Studio (circle one)
Area:           [XX] sq m
Furnished:      Yes / Partially / No
Included items: [List appliances, furniture if furnished]
Parking space:  Yes (space No. [X]) / No
Storage:        Yes / No

LEASE TERM
----------
Start Date: [DD/MM/YYYY]
Duration:   [X] years (minimum 3 years under Greek law for residential,
             unless agreed shorter per Art. 2 Law 1703/1987)
End Date:   [DD/MM/YYYY]
Automatic renewal: Yes / No — on [X]-month notice by either party

FINANCIAL TERMS
---------------
Monthly Rent: € [Amount] per calendar month
  Payable on: the [Xth] day of each month
  Payment method: Bank transfer to Landlord IBAN above

Rent Review: Annually on the anniversary of the start date by [X]%
  OR by reference to the Greek Consumer Price Index (ΔΤΚ), whichever is less.

Security Deposit (Εγγύηση): € [Amount] = [X] months' rent
  Paid upon signing. To be returned within [30] days of lease end,
  less any deductions for damage beyond fair wear and tear.

TENANT OBLIGATIONS
------------------
1. Pay rent punctually on the due date.
2. Use the Property solely for residential purposes.
3. Maintain the Property in good condition and report any damage promptly.
4. Not sublet or assign without the Landlord's prior written consent.
5. Not make structural alterations without the Landlord's written consent.
6. Pay electricity (ΔΕΗ), water, gas, and telecoms in their own name.
7. Pay the municipal council tax (Τέλη Κοινοχρήστων) applicable to the unit.
8. Vacate on expiry of the lease and return keys in good condition.

LANDLORD OBLIGATIONS
--------------------
1. Deliver the Property in good habitable condition.
2. Maintain structural elements, roof, and building systems.
3. Not interfere with the Tenant's peaceful enjoyment (Art. 574 GCC).
4. Declare this lease to AADE (Taxis/myProperty) within 30 days of signing.
5. Issue a monthly rent receipt (Απόδειξη Μίσθωσης) if requested.

TAX REGISTRATION
----------------
The parties acknowledge this agreement must be filed with AADE via the
myProperty platform within one month of commencement (Law 4223/2013 Art. 39).

TERMINATION
-----------
- By Tenant: [X] months' written notice.
- By Landlord: Minimum 3-month written notice for own use (ιδιόχρηση)
  with supporting documentation, in accordance with Greek tenancy law.
- For non-payment: Landlord may commence eviction proceedings (αγωγή
  αποβολής) before the competent Magistrates' Court after 1 month arrears.

ADDITIONAL CLAUSES
------------------
1. Pets: Permitted / Not permitted (circle).
2. Smoking: Permitted indoors / Outdoors only / Prohibited (circle).
3. Subletting: Strictly prohibited without prior written consent.
4. Insurance: Tenant to maintain third-party liability insurance for the unit.

GOVERNING LAW
-------------
Greek law (Presidential Decree 34/1995, Law 1703/1987 as amended).
Jurisdiction: Courts of [City], Greece.

SIGNATURES
----------
Landlord: ________________________   Date: ____________

Tenant:   ________________________   Date: ____________

Witness:  ________________________   Date: ____________
`,
  },
  {
    id: "short-term-rental",
    category: "rental",
    name: "Short-Term Rental Agreement",
    nameEl: "Σύμβαση Βραχυχρόνιας Μίσθωσης",
    description:
      "Airbnb-style short-term rental contract compliant with Greek Law 4472/2017 on sharing economy.",
    languages: ["English"] as string[],
    format: "DOCX",
    content: `SHORT-TERM RENTAL AGREEMENT
(Law 4472/2017 — Sharing Economy / Βραχυχρόνια Μίσθωση)

Booking Reference: [XXXXX]
Platform: [Airbnb / Booking.com / Direct / Other]

HOST (Ιδιοκτήτης / Εκμισθωτής)
-------------------------------
Name:  [Full Name]
ΑΦΜ:   [XXXXXXXXX]
AMA (Short-Let Registry No.): [XXXXXXXX] — as registered with AADE
Address: [Full Address]
Contact: [Email]

GUEST (Μισθωτής)
----------------
Name:      [Full Name]
Passport / ID: [XXXX]
Nationality:   [Country]
Contact:       [Email]

PROPERTY
--------
Name/Title: "[Listing Name]"
Address:    [Full Address, Floor]
Capacity:   [X] guests maximum
AMA No.:    [XXXXXXXX] (displayed at property)

BOOKING DETAILS
---------------
Check-In:    [DD/MM/YYYY] at [HH:MM]
Check-Out:   [DD/MM/YYYY] at [HH:MM]
Nights:      [X]
Guests:      [X] adults, [X] children

FINANCIAL TERMS
---------------
Nightly Rate:    € [Amount]
Cleaning Fee:    € [Amount]
Security Deposit: € [Amount] (refundable within 48 hours of check-out)
City Tax (ΤΔ):   € [Amount/night] x [X nights] = € [Total]
  [City tax rate: 0.50–4.00 per night per unit per Greek law]
TOTAL DUE:       € [Amount]

Payment Method: [Stripe / Bank Transfer / Platform / Cash on arrival]

HOUSE RULES
-----------
1. No smoking indoors.
2. No parties or events.
3. Quiet hours: 22:00–08:00.
4. Maximum [X] guests at all times — no additional overnight visitors.
5. Pets: [Permitted / Not permitted].
6. Check-in after [HH:MM]; check-out by [HH:MM].
7. Keys to be returned to [lockbox code: XXXX / reception / host].

CANCELLATION POLICY
-------------------
[Flexible / Moderate / Strict — describe]:
  - Full refund if cancelled [X] days before check-in.
  - 50% refund if cancelled [X]–[X] days before check-in.
  - No refund for cancellations within [X] days of check-in.

HOST OBLIGATIONS
----------------
1. Provide clean, well-maintained accommodation as described.
2. Provide all listed amenities (Wi-Fi, linen, towels, etc.).
3. Ensure valid AMA registration is displayed.
4. Collect and remit city tax to the municipality.
5. Register Guest data with Hellenic Police (ΕΛ.ΑΣ.) within 24 hours
   of check-in via the electronic platform (Law 4850/2021).

GUEST OBLIGATIONS
-----------------
1. Use the property only for accommodation purposes.
2. Respect maximum occupancy limits.
3. Report any damage promptly.
4. Leave property clean and in the condition found.
5. Provide ID / passport for police registration.

LIABILITY
---------
The Host is not liable for loss or damage to Guests' personal belongings.
Guests are liable for any damage caused to the property exceeding normal
wear, deducted from the security deposit.

GOVERNING LAW
-------------
Greek law (Law 4472/2017 as amended, Law 4850/2021).
Jurisdiction: Courts of [City], Greece.

SIGNATURES
----------
Host:  ________________________   Date: ____________

Guest: ________________________   Date: ____________
`,
  },
  {
    id: "commercial-lease",
    category: "rental",
    name: "Commercial Lease Agreement",
    nameEl: "Εμπορική Μίσθωση",
    description:
      "Commercial tenancy agreement for retail, office, or warehouse use under Greek commercial lease law.",
    languages: ["English"] as string[],
    format: "DOCX",
    content: `COMMERCIAL LEASE AGREEMENT
(ΕΠΑΓΓΕΛΜΑΤΙΚΗ / ΕΜΠΟΡΙΚΗ ΜΙΣΘΩΣΗ)

Governed by Presidential Decree 34/1995 & Law 4242/2014

Dated: [DD/MM/YYYY]

PARTIES
-------
Landlord: [Full Name / Company], ΑΦΜ [XXXXXXXXX],
          [Address], represented by [Name, Title if applicable]

Tenant:   [Company Name], ΑΦΜ [XXXXXXXXX], ΓΕΜΗ [XXXXXXX],
          Registered address: [Address],
          Represented by: [Name, Title, Authority reference]

PREMISES
--------
Address:    [Full address, floor, unit]
Use:        [Retail / Office / Warehouse / Restaurant / Other]
Area:       [XXX] sq m (net lettable area)
Common areas: [X]% share of building common areas
Parking:    [X] dedicated spaces (Nos. [X])
Planning permission for commercial use: Yes — Ref. [XXXX]

TERM
----
Commencement: [DD/MM/YYYY]
Duration:     [X] years
Minimum term: 12 years per Art. 13 PD 34/1995 (or shorter by written agreement)
Expiry:       [DD/MM/YYYY]

RENT
----
Initial Monthly Rent: € [Amount] per month + VAT at 24%
  → Total monthly payment: € [Amount incl. VAT]

Rent-Free Period: [X] months from commencement (fit-out grace period)

Rent Review:
  Year 1–3:  Fixed at above rate
  Year 4+:   Annual increase of [X]% or Greek CPI, whichever is greater

SECURITY DEPOSIT
----------------
Amount: € [Amount] = [X] months' rent (excl. VAT)
  Paid upon signing. Interest-free. Returned within 30 days of lease
  expiry subject to condition inspection and settlement of arrears.

OPERATING EXPENSES (ΚΟΙΝΟΧΡΗΣΤΑ)
---------------------------------
Tenant pays:
□ Electricity and gas consumed in the Premises
□ Insurance premium for Tenant's fit-out and stock
□ Proportional share of building common expenses (κοινόχρηστα)
□ Municipal business tax (Δημοτικά Τέλη Επιτηδεύματος)
□ Any business rates applicable to Tenant's trade

Landlord pays:
□ Structural maintenance and building envelope
□ Landlord's insurance on building structure
□ Major plant & machinery repairs (HVAC, lifts)

ALTERATIONS & FIT-OUT
----------------------
1. Tenant may carry out fit-out works with Landlord's written consent.
2. All alterations require building permit where required by law.
3. On expiry, Tenant shall reinstate to original condition unless
   Landlord elects to retain Tenant's improvements.

SUBLETTING & ASSIGNMENT
-----------------------
Tenant may not sublet or assign without Landlord's prior written consent,
not to be unreasonably withheld for assignment to a Group company.

BREAK CLAUSE
------------
Either party may terminate after [X] years on [X] months' written notice.
[OR: No break clause — fixed term.]

RENEWAL
-------
Tenant has a preferential right (Art. 43 PD 34/1995) to renew on expiry
on no less favourable terms, exercised by written notice [X] months before expiry.

GOVERNING LAW & DISPUTES
-------------------------
Greek law. Any disputes to be resolved before the courts of [City], Greece,
or by arbitration under the Hellenic Arbitration Association rules (if agreed).

SIGNATURES
----------
Landlord: ________________________   Date: ____________
          [Company seal if applicable]

Tenant:   ________________________   Date: ____________
          [Company seal]

Witness:  ________________________   Date: ____________
`,
  },

  // ── Investor ──
  {
    id: "nda-property",
    category: "investor",
    name: "Non-Disclosure Agreement (NDA) — Property Transaction",
    nameEl: "Συμφωνητικό Εμπιστευτικότητας",
    description:
      "Mutual NDA for sharing confidential property and financial information during deal negotiations.",
    languages: ["English"] as string[],
    format: "DOCX",
    content: `MUTUAL NON-DISCLOSURE AGREEMENT
(PROPERTY TRANSACTION)

Effective Date: [DD/MM/YYYY]

PARTIES
-------
Party A: [Full Name / Company], ΑΦΜ [XXXXXXXXX], [Address]
         ("Disclosing Party / Receiving Party")

Party B: [Full Name / Company], ΑΦΜ [XXXXXXXXX], [Address]
         ("Receiving Party / Disclosing Party")

(Each acting as both disclosing and receiving party — mutual NDA)

BACKGROUND
----------
The Parties are considering entering into a transaction relating to the
acquisition, sale, joint venture, or financing of real property assets
in Greece (the "Transaction") and wish to protect confidential information
exchanged in connection with the Transaction.

DEFINITIONS
-----------
"Confidential Information" means any non-public information disclosed by
one Party to the other, in any form (written, oral, electronic), including:
  - Property addresses, valuations, rental income, tenancy schedules
  - Financial statements, investment models, IRR calculations
  - Off-market deal terms, vendor motivations, reserve prices
  - Legal due diligence reports, structural surveys
  - Business plans, investor lists, financing structures
  - Any information marked "Confidential" or that a reasonable person
    would understand to be confidential in the context

OBLIGATIONS
-----------
Each Receiving Party undertakes to:
1. Keep all Confidential Information strictly confidential.
2. Use Confidential Information solely for evaluating the Transaction.
3. Disclose only to employees, advisers, or financiers on a need-to-know
   basis, subject to equivalent confidentiality obligations.
4. Not disclose to any third party without prior written consent.
5. Promptly notify the Disclosing Party of any unauthorised disclosure.

EXCLUSIONS
----------
Confidentiality obligations do NOT apply to information that:
(a) is or becomes publicly known through no breach of this NDA;
(b) was already known to the Receiving Party before disclosure;
(c) is received from a third party free of any confidentiality obligation;
(d) is required to be disclosed by applicable law or court order
    (in which case prior written notice shall be given where lawful).

TERM
----
This NDA shall remain in force for [2] years from the Effective Date,
or until the Parties execute a formal transaction agreement, whichever
is later.

RETURN OF INFORMATION
---------------------
Upon request or termination of negotiations, the Receiving Party shall
promptly return or destroy all Confidential Information and copies.

NO LICENCE OR PARTNERSHIP
--------------------------
This NDA does not grant any licence over intellectual property or create
any partnership, joint venture, or agency between the Parties.

REMEDIES
--------
The Parties acknowledge that breach may cause irreparable harm for which
monetary damages alone may be insufficient, and agree that injunctive
relief may be sought without requirement for bond or security.

GOVERNING LAW
-------------
Greek law and the EU Trade Secrets Directive (2016/943) as transposed
by Law 4605/2019. Jurisdiction: courts of Athens, Greece.

SIGNATURES
----------
Party A: ________________________   Date: ____________
         [Name, Title, Company seal]

Party B: ________________________   Date: ____________
         [Name, Title, Company seal]
`,
  },
  {
    id: "quick-sale-framework",
    category: "investor",
    name: "Quick Sale Agreement Framework",
    nameEl: "Πλαίσιο Σύμβασης Άμεσης Πώλησης",
    description:
      "Investor cash-purchase framework for accelerated property acquisitions below market value.",
    languages: ["English"] as string[],
    format: "DOCX",
    content: `QUICK SALE AGREEMENT FRAMEWORK
(CASH PURCHASE — BELOW MARKET VALUE ACQUISITION)

Date: [DD/MM/YYYY]
Reference: QS-[YYYY]-[XXXX]

PARTIES
-------
Investor / Buyer: [Company Name], ΑΦΜ [XXXXXXXXX], ΓΕΜΗ [XXXXXXX],
                  [Address], represented by [Name, Director]
                  ("the Investor")

Vendor / Seller:  [Full Name], ΑΦΜ [XXXXXXXXX], ID [XXXX],
                  [Address] ("the Vendor")

RECITALS
--------
A. The Vendor is the registered owner of the Property described below.
B. The Vendor has approached the Investor seeking a rapid cash sale
   with certainty of completion within an agreed timeframe.
C. In consideration of the Investor's ability to exchange and complete
   quickly without mortgage finance, the parties have agreed a
   discounted purchase price as set out below.
D. The Vendor confirms having received independent legal advice
   and understands the below-market-value nature of this sale.

THE PROPERTY
------------
Address:        [Full address]
ΚΑΕΚ:           [XX/XX/XX/XXXXX/X/X]
Estimated open market value: € [Amount] (per independent valuation
  report dated [DD/MM/YYYY] by [Valuer Name], RICS/TEE certified)
Agreed Quick Sale Price: € [Amount] (representing [XX]% of market value)
  Reason for discount accepted by Vendor: Speed / Financial urgency /
  Certainty of sale / Condition (delete as applicable)

FINANCIAL TERMS
---------------
Quick Sale Price: € [Amount]
  - Exchange deposit (10%): € [Amount] — paid within [3] business days
  - Balance: € [Amount] — paid on completion

Completion: Within [10–28] business days of exchange — GUARANTEED
            No mortgage condition. Cash funds confirmed by bank letter
            attached as Annex I.

VENDOR WARRANTIES
-----------------
The Vendor warrants that:
1. They have full legal title, free of undisclosed encumbrances.
2. They are not subject to bankruptcy, insolvency, or legal proceedings.
3. No other sale, option, or exclusivity is in place.
4. All ENFIA, taxes, and utility bills are paid to date.
5. They have disclosed all material facts affecting the Property.

INVESTOR'S CONDITIONS (to be waived at Investor's option)
---------------------------------------------------------
□ Satisfactory desktop title search (5 business days)
□ Structural survey (waivable — purchased as seen)
□ Planning compliance check (5 business days)
□ Confirmation of vacant possession at completion

VACANT POSSESSION
-----------------
The Vendor confirms the Property will be delivered with vacant
possession on the completion date. Any tenants have been / will be
lawfully served notice by [date].

COSTS
-----
Transfer Tax: Borne by Investor (Buyer)
Notary fees: Borne by Investor (Buyer)
Vendor's legal fees: Investor to contribute up to € [Amount] as a
  goodwill gesture given the below-market price (optional clause)

CONFIDENTIALITY
---------------
The terms of this agreement, including the purchase price, are strictly
confidential and shall not be disclosed to any third party without
prior written consent of both parties.

ACKNOWLEDGEMENT
---------------
THE VENDOR ACKNOWLEDGES:
- This sale is at a discount to open market value.
- They have been advised to obtain independent legal advice.
- They freely enter into this agreement without duress.
- They have had adequate time to consider the terms.

Vendor declaration: "I have read and understood this agreement, I have
received independent legal advice, and I freely accept the Quick Sale price."

SIGNATURES
----------
Investor: ________________________   Date: ____________
          [Name, Title, Company seal]

Vendor:   ________________________   Date: ____________

Vendor's Lawyer: _________________   Date: ____________
[Confirm independent advice given]
`,
  },
  {
    id: "investment-mandate",
    category: "investor",
    name: "Investment Mandate Letter",
    nameEl: "Επιστολή Επενδυτικής Εντολής",
    description:
      "Formal mandate from investor to broker/agent to source property matching defined acquisition criteria.",
    languages: ["English"] as string[],
    format: "DOCX",
    content: `INVESTMENT MANDATE LETTER
(PROPERTY ACQUISITION — GREECE)

Date: [DD/MM/YYYY]
Mandate Reference: IML-[YYYY]-[XXX]

FROM (Investor / Principal):
  [Full Name / Fund / Company]
  [Address]
  ΑΦΜ / Registration: [XXXXXXXXX]
  Contact: [Name, Email]
  ("the Principal")

TO (Agent / Broker / Finder):
  [Name / Company]
  [Address]
  REMF Licence No. (if applicable): [XXXX] — Hellenic Real Estate Brokers
  ("the Agent")

PURPOSE
-------
The Principal hereby mandates the Agent to source, identify, and present
real estate investment opportunities in Greece matching the criteria
set out below ("the Mandate"), on an exclusive / non-exclusive basis
(delete as applicable) for a period of [X] months from the date hereof.

ACQUISITION CRITERIA
--------------------
Asset Types:         [Residential / Commercial / Mixed / Hospitality / Land]
Location(s):         [Athens Centre / Northern Suburbs / Thessaloniki /
                      Greek Islands: Mykonos, Santorini, Corfu / Other]
Budget Range:        € [Min Amount] — € [Max Amount] per asset
                     OR total portfolio budget: € [Total]
Target Yield:        [X]% gross / net initial yield (for income assets)
Target IRR:          [X]% (5-year hold assumption)
Hold Strategy:       [Buy & hold / Buy & refurbish & sell / Short-term rental]
Lot Size:            [X] sq m min — [X] sq m max
Building Year:       [Post-XXXX preferred / Any]
Condition:           [Turnkey / Requiring renovation / Land only]
Special Criteria:    [Sea view / Listed building / Golden Visa eligible /
                      Airport proximity / Specific municipality]

GOLDEN VISA NOTE (if applicable)
---------------------------------
The Principal is interested in assets qualifying for the Greek Golden
Visa programme (Residence Permit under Law 4251/2014 as amended by
Law 5100/2024). Minimum qualifying investment: € 800,000 (Athens / Thessaloniki
/ Mykonos / Santorini) or € 400,000 (other areas). Properties must be
unencumbered and suitable for visa application.

AGENT OBLIGATIONS
-----------------
1. Present a minimum of [X] qualifying opportunities per month.
2. Provide for each opportunity: address, photos, asking price, yield
   analysis, planning status, and ownership confirmation.
3. Arrange viewings within [X] business days of instruction.
4. Maintain confidentiality of Principal's identity until LOI stage.
5. Act in the Principal's best interest at all times.

PRINCIPAL'S OBLIGATIONS
------------------------
1. Respond to presentations within [X] business days.
2. Provide proof of funds / bank comfort letter when required.
3. Not circumvent the Agent by approaching vendors directly during
   the Mandate period.

FEES
----
Success fee: [X]% of the final purchase price, payable upon
  execution of the notarial deed of transfer.
  Minimum fee: € [Amount]

Retainer (if exclusive): € [Amount] per month, deducted from
  success fee on transaction completion.

No success fee is payable if no transaction is completed.

EXCLUSIVITY
-----------
[Exclusive]: The Principal shall not appoint any other agent to
  search for the same asset types in the same locations during the
  Mandate period.

[OR Non-Exclusive]: The Principal may appoint other agents in
  parallel. No fee is payable unless the Agent introduces the
  eventual property acquired.

TERM & TERMINATION
------------------
Duration: [X] months from [DD/MM/YYYY]
Renewal:  By mutual written agreement
Termination: Either party may terminate on [30] days' written notice.
             Tail period: [6] months — fee payable for any transaction
             completing within [6] months of termination if the property
             was introduced by the Agent during the Mandate period.

CONFIDENTIALITY
---------------
Both parties shall keep the terms of this Mandate and all information
exchanged strictly confidential (see separate NDA if signed).

GOVERNING LAW
-------------
Greek law. Any disputes before the courts of Athens, Greece.

ACCEPTED AND AGREED:

Principal: ________________________   Date: ____________
           [Name, Title, Signature]

Agent:     ________________________   Date: ____________
           [Name, Title, REMF Licence stamp]
`,
  },
];
