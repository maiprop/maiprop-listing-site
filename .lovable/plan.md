

# MaiProp Golden Visa — Investment One-Pager & Admin Platform

## Brand & Design
- Dark navy (#000059, #0f132e) backgrounds with cyan (#4ef5f1) and purple (#8755f2) accents
- Clean, minimal typography with one-liner copy throughout
- Modern, premium feel targeting international investors

---

## Page 1: One-Pager Landing (Public)

### Hero Section
- Bold headline about Greek Golden Visa opportunity
- One-line value proposition focused on deal origination
- CTA button linking to WhatsApp AI agent for instant contact

### Golden Visa Overview
- Brief stats/highlights (minimum investment, residency benefits, ROI potential)
- One-liners only — no long paragraphs

### Featured Investment Opportunities
- Grid of property cards (image, title, price, location, status badge)
- Click opens a **detailed modal** with:
  - Photo gallery
  - Property specifics (size, bedrooms, price, yield)
  - Floor plan image
  - Location map / Points of Interest
  - CTA to WhatsApp for inquiries

### Previous Delivered Projects
- Visual showcase carousel/grid of completed projects
- Each with photo, name, location, and completion status

### Platform Reference
- Subtle section mentioning **os.maiprop.co** as a self-service tool for investors to assess opportunities independently (not pushy, positioned as a resource)

### WhatsApp Lead Capture
- Floating WhatsApp button (always visible)
- Links to WhatsApp with pre-filled message for AI agent conversation
- Instant, direct communication channel

---

## Page 2: Admin Dashboard (Protected route, `/admin`)

### Property Management
- Table view of all properties (current + previous) with sorting by title, price, status, date added
- **Missing Information Indicator**: visual badges/icons on properties lacking image URL, price, or status
- **CRUD Operations**: Add new property, edit existing, delete — all via modal forms
- Property form fields: title, description, images, price, size, bedrooms, floor plan, location, POI, status (available/sold/under construction), project type (new/delivered)
- **Bulk Edit**: Select multiple properties via checkboxes → batch update status

### Data Storage
- All property data stored in local state initially (no backend needed to start)
- Structured to easily migrate to a database later if needed

---

## Technical Notes
- No backend required initially — all data managed client-side with option to add Supabase later
- WhatsApp integration via `https://wa.me/` links (no API needed)
- Responsive design for mobile and desktop
- React Router for landing page (`/`) and admin (`/admin`)

