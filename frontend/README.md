# DocTraceAI Frontend

Production-oriented React 19 + Vite frontend for DocTraceAI. The app is structured as a feature-based SaaS shell so the same codebase can support landing pages, auth, dashboards, document workflows, and grounded AI chat without collapsing into a generic admin panel.

## Folder Purpose

- `src/api/` centralizes the backend contract and Axios clients.
- `src/app/` holds app-level bootstrap utilities such as the query client and error boundary.
- `src/assets/` stores static brand assets, illustrations, and icons.
- `src/components/common/` contains reusable design-system primitives and shared blocks.
- `src/components/layout/` holds navigation, shells, and responsive app chrome.
- `src/components/auth/` contains form-specific auth helpers and auth marketing blocks.
- `src/components/chat/` contains the grounded chat workspace, message, and citation UI.
- `src/components/documents/` contains upload, list, and document detail components.
- `src/components/dashboard/` contains analytics cards, charts, and activity widgets.
- `src/components/settings/` contains profile, security, notification, theme, and API-key UI.
- `src/components/billing/` contains pricing, plan comparison, and usage widgets.
- `src/components/analytics/` contains chart and reporting helpers.
- `src/pages/` contains route-level screens.
- `src/routes/` contains route definitions and protected-route logic.
- `src/hooks/` contains React Query hooks and feature hooks.
- `src/layouts/` contains landing, auth, and app shells.
- `src/providers/` contains Redux, React Query, persistence, and theme bootstrap.
- `src/store/` contains Redux Toolkit slices, persistence, and typed hooks.
- `src/services/` contains non-HTTP helpers such as query keys and streaming utilities.
- `src/types/` contains shared TypeScript models for the backend contract.
- `src/constants/` contains navigation, app metadata, and static product copy.
- `src/utils/` contains formatting and browser helpers.
- `src/lib/` contains low-level utilities such as `cn` for class composition.
- `src/styles/` contains global CSS, theme tokens, and motion rules.

## Design System

- Typography uses a display face for headings and a clean sans family for body copy.
- Spacing is based on an 8px rhythm with larger surface padding on major panels.
- The color system uses slate-backed neutrals with blue and emerald accents to signal intelligence and trust.
- Cards use soft borders, subtle gradients, and restrained shadows instead of heavy outlines.
- Motion is limited to page entry, hover elevation, sidebar transitions, and streaming chat states.
- Accessibility is built in with semantic landmarks, focus rings, and contrast-aware text colors.
- Responsive behavior prioritizes a single-column mobile experience and persistent navigation affordances on desktop.

## Implemented Product Areas

- Landing page with hero, trusted-by row, features, workflow, capabilities, testimonial, pricing, FAQ, CTA, and footer.
- Auth pages for login, registration, forgot password, reset password, and email verification using React Hook Form and Zod.
- Protected application shell with desktop sidebar, mobile navigation, top search, theme switcher, user context, and logout.
- Dashboard with document, question, storage, AI request, recent upload, and Recharts usage analytics.
- Document list, details, upload dropzone with progress, processing status badges, deletion, summary, FAQ, and chat launch flows.
- Streaming RAG chat using the backend SSE endpoint with document selection, conversation sidebar, markdown rendering, copy actions, and citations.
- Citation panel showing document name, page, chunk, source snippet, and relevance score.
- Settings with profile, theme selection, and API key creation/revocation against the backend account endpoints.
- Billing and analytics pages using subscription, usage, and chart data from the backend.

## Responsiveness and Accessibility

- Desktop uses a persistent `lg` sidebar and wide content grid.
- Tablet collapses dense grids while keeping card spacing readable.
- Mobile uses an overlay navigation drawer, single-column cards, full-width buttons, and no horizontal scrolling.
- Interactive elements are real buttons or links with labels, focus rings, and keyboard-operable controls.
- Empty, loading, and error states are visible surfaces instead of plain text.

## Performance Decisions

- Route pages are lazy loaded through `React.lazy` and `Suspense`.
- Recharts and markdown/syntax rendering are isolated into route-level chunks.
- Syntax highlighting uses `PrismLight` with only bash, JSON, markdown, and TypeScript languages registered.
- React Query owns server cache, retry behavior, invalidation, and loading states.
- Redux Persist stores only auth and theme. Temporary UI and streaming state are not persisted.

## Backend Integration

The frontend talks to the FastAPI backend under `VITE_API_BASE_URL`, which defaults to `http://localhost:8000/api/v1`. Auth uses JWT bearer tokens with refresh support, documents use multipart upload plus offset pagination, and chat supports both normal responses and SSE streaming.
