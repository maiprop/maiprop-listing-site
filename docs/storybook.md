# Storybook — Component Documentation (future work)

Storybook is **not yet installed** for this project. This document captures the
proposed setup and rationale so that it can be added in a dedicated PR.

## Why defer

- Adds ~200 MB of dev dependencies and ~30 transitive packages.
- Requires config alignment with Vite 5, Tailwind, i18next, and Radix UI.
- Existing UI primitives (`src/components/ui/`) come from shadcn/ui and are
  already self-documenting via source; bespoke components benefit most.

## When to add

Add Storybook when **any two** of the following become true:
1. More than 3 designers / QA engineers need to review components without running the full app.
2. Visual regression testing (Chromatic / Percy) is adopted.
3. A public design-system library is carved out of this repo.

## Proposed installation

```powershell
npx storybook@latest init --type react --builder vite
npm install --save-dev @storybook/addon-a11y @storybook/addon-interactions @storybook/test
```

## Proposed config skeleton

```ts
// .storybook/main.ts
import type { StorybookConfig } from "@storybook/react-vite";
const config: StorybookConfig = {
  stories: ["../src/components/**/*.stories.@(ts|tsx|mdx)"],
  addons: [
    "@storybook/addon-essentials",
    "@storybook/addon-a11y",
    "@storybook/addon-interactions",
  ],
  framework: { name: "@storybook/react-vite", options: {} },
};
export default config;
```

```tsx
// .storybook/preview.tsx
import type { Preview } from "@storybook/react";
import "../src/index.css";
import { MemoryRouter } from "react-router-dom";

const preview: Preview = {
  decorators: [
    (Story) => (
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Story />
      </MemoryRouter>
    ),
  ],
};
export default preview;
```

## Priority components to document first

1. `PropertyCard` — highest visual reuse
2. `ListingTypeButton`, `PropertyTypeButton`
3. `StepType`, `StepFeatures`, `StepMedia` (listing wizard)
4. `AdminProfessionalVerification`, `LeadsCRM` (admin surfaces)
5. `PropertyGallery`, `PropertyMiniMap`

## Alternative for now

For quick visual inspection without Storybook, use the existing Playwright
`--ui` mode:
```powershell
npm run test:e2e:ui
```
This gives a browser-based inspector of every page in its real rendered state.
