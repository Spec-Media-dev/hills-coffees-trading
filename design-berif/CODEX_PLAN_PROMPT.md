# Hills Coffee — Codex Design Research & Planning Task

You are working in the existing Hills Coffee / Hills Coffee Trading repository.

This is a DESIGN RESEARCH AND PLANNING task only.

DO NOT implement the redesign.
DO NOT modify application code.
DO NOT refactor existing components.
DO NOT delete or replace existing functionality.

The final deliverable is an implementation-ready design plan that another coding agent will execute later.

---

## Mandatory Sources

You MUST use all of the following before finalizing the plan.

### 1. Project design brief

Read this file completely:

`design-berif/DESIGN_BRIEF.md`

Treat it as the primary project-specific design brief.

Do not blindly copy its reference style.
Interpret it in the context of Hills Coffee / Hills Coffee Trading.

---

### 2. Refero MCP

Use the configured Refero MCP extensively.

Research BEFORE making design decisions.

Research should cover:

- premium B2B website visual styles
- premium commodity / sourcing / trading websites
- refined editorial commercial websites
- high-trust business landing pages
- strong navigation patterns
- modern hero composition
- premium service presentation
- sourcing / traceability storytelling
- logistics / process presentation
- strong contact / inquiry conversion sections
- elegant footer patterns
- tasteful motion-friendly layouts

Use:

1. Refero Styles for visual language.
2. Refero Screens for specific layout/component decisions.
3. Refero Flows where useful for navigation, inquiry, contact, and conversion journeys.

Do not search Refero only for websites that look exactly like Tomorro.

The purpose of Refero research is to broaden the design evidence and create a distinctive Hills Coffee result.

---

### 3. Tomorro motion/video reference

Inspect this local reference video:

`design-berif/references/tomorro-reference.mp4`

This video is IMPORTANT.

It represents the type of polish, movement, rhythm, visual hierarchy, and interaction quality we want to study.

Analyze it carefully.

Pay attention to:

- navbar appearance and behavior
- hero composition
- page entrance
- section transitions
- dark/light section rhythm
- typography scale
- visual hierarchy
- scrolling rhythm
- spacing
- object movement
- reveal animations
- card movement
- image movement
- parallax, if present
- hover-like behavior, if visible
- transition timing
- easing feel
- use of whitespace
- how movement supports hierarchy
- how motion avoids becoming distracting

Tomorro is a REFERENCE, not the target product.

DO NOT reproduce it literally.
DO NOT recreate sections one-to-one.
DO NOT copy its SaaS-specific content.
DO NOT use software-dashboard visuals simply because Tomorro does.

Translate useful principles into the Hills Coffee business and visual identity.

If the MP4 cannot be inspected directly, do NOT ignore it.

Instead:
- use an available local video inspection method;
- extract representative frames from the video, preferably including scene/section changes;
- inspect those frames;
- use video metadata/timestamps if useful;
- document what was actually observable.

Do not invent details that cannot be verified from the video.

---

## Inspect the Existing Project

Before proposing any redesign:

Inspect the current repository.

Understand:

- framework and frontend architecture
- current routing
- existing pages
- existing components
- current homepage
- current content
- existing assets
- logos
- images
- fonts
- design tokens
- responsive implementation
- existing animation libraries
- existing Tailwind/CSS setup
- reusable UI primitives
- current business functionality

The redesign plan must fit THIS project.

Do not design a hypothetical new project detached from the current codebase.

Preserve existing product/business behavior.

---

# Design Goal

Create a premium, distinctive design direction for:

**Hills Coffee / Hills Coffee Trading**

It should communicate:

- green coffee sourcing
- quality
- traceability
- trust
- origins
- trading expertise
- logistics
- warehousing
- reliable business relationships
- premium B2B positioning in the Arab/MENA market

The website must NOT feel like:

- a SaaS product
- a generic coffee shop
- a consumer café
- a coffee template
- a generic AI-generated landing page
- a direct Tomorro clone

It should feel like a sophisticated international green-coffee sourcing and trading company.

---

# Visual Quality Bar

Target an exceptionally polished result.

The future implementation should feel:

- clean
- premium
- contemporary
- calm
- highly intentional
- spacious
- editorial
- tactile
- modern
- trustworthy
- technically refined

Every major decision should be deliberate:

- typography
- color
- spacing
- radius
- imagery
- layout
- hierarchy
- motion
- micro-interaction
- responsive behavior
- accessibility

Avoid visual noise.

Avoid generic design patterns unless they clearly serve the design.

Avoid excessive cards.

Avoid excessive rounded containers.

Avoid random gradients.

Avoid random glow effects.

Avoid meaningless decorative shapes.

Avoid "AI landing page" aesthetics.

---

# Tomorro Adaptation Principle

Use Tomorro primarily as inspiration for:

- restraint
- strong typography
- dark/light rhythm
- premium spacing
- pill navigation concepts
- controlled accent color
- smooth movement
- sophisticated visual pacing
- atmospheric composition

But reinterpret these ideas for Hills Coffee.

For example:

Tomorro product UI cards
→ should NOT become fake software dashboards.

Instead consider appropriate Hills Coffee visual subjects such as:

- origin photography
- coffee-bean macro photography
- green coffee grading
- sourcing cards
- origin maps
- traceability details
- quality metrics
- warehouse imagery
- shipment / trade information
- crop/origin storytelling
- carefully designed editorial data surfaces

---

# Imagery

Images are allowed and encouraged where they materially improve the design.

Do not avoid imagery merely to keep implementation easy.

Determine what imagery each section actually needs.

Specify:

- image purpose
- content
- composition
- crop
- aspect ratio
- lighting
- tone
- desktop behavior
- mobile behavior
- whether photography, illustration, texture, diagram, or generated artwork is appropriate

Prefer:

- premium editorial green-coffee photography
- green beans
- origin environments
- quality inspection
- hands performing meaningful coffee work
- warehouses / logistics where relevant
- coffee sourcing processes
- maps/origin storytelling

Avoid:

- latte art
- coffee-shop clichés
- roasted-bean stock photos used without purpose
- smiling stock-model poses
- fake luxury imagery
- generic AI imagery

If a specific missing asset would significantly improve the design, explicitly request it in the plan.

---

# Motion System

Create a coherent motion language, not random animations.

Define motion for:

- initial page load
- navbar
- hero
- section entrance
- image reveals
- text reveals
- cards
- buttons
- links
- dropdowns
- mobile navigation
- scroll-linked moments, only when justified

For each meaningful animation specify:

- trigger
- property being animated
- approximate duration
- easing behavior
- direction
- stagger behavior if any
- desktop/mobile differences
- reduced-motion fallback

Motion should communicate refinement.

Avoid animation simply because animation is possible.

Avoid heavy scroll-jacking.

Avoid animation that harms performance or accessibility.

---

# Responsive Design

Do not treat mobile as a scaled-down desktop.

Plan explicitly for:

- large desktop
- standard desktop
- tablet
- mobile

For key sections specify:

- layout changes
- typography scaling
- stacking order
- image behavior
- navigation behavior
- spacing changes
- CTA behavior
- motion reduction/simplification

---

# Accessibility

Plan for:

- keyboard navigation
- visible focus states
- semantic headings
- sufficient color contrast
- readable typography
- touch target sizing
- reduced-motion preferences
- accessible dropdown/menu behavior
- meaningful image alt text strategy

Premium design must not sacrifice usability.

---

# Technical / Implementation Awareness

Inspect the project's actual frontend stack before prescribing libraries.

Prefer existing dependencies when they are sufficient.

Do not add a heavy animation library merely for simple transitions.

If recommending a new dependency, explain why it is justified.

The implementation should favor:

- reusable components
- centralized tokens
- consistent CSS variables / Tailwind tokens
- maintainable sections
- good performance
- sensible client/server boundaries
- optimized images
- minimal layout shift

---

# Required Refero Evidence

In the final plan, include a section called:

## Refero Research Ledger

For every important reference used, record:

- reference name
- reference type: Style / Screen / Flow
- what was useful
- exact design principle borrowed
- where it would be adapted in Hills Coffee
- what should NOT be copied

Use multiple references.

Do not average them into a generic middle-ground design.

Choose ONE dominant direction and use secondary references for narrow improvements only.

---

# Required Video Evidence

Include:

## Tomorro Video Study

Document:

- major observed visual patterns
- useful movement patterns
- section pacing
- navigation observations
- spacing observations
- typography observations
- visual effects worth adapting
- things inappropriate for Hills Coffee

Separate OBSERVED facts from INTERPRETATION.

---

# Required Design Decisions

The plan must define:

## Brand visual thesis

A short, memorable visual concept for Hills Coffee.

## Color system

Define exact roles for every color used.

Do not simply dump the Tomorro palette.

Adjust the palette where Hills Coffee needs a different result.

## Typography system

Use practical, legally usable fonts.

Prefer free/open alternatives when proprietary fonts are unavailable.

Define:
- display
- headings
- body
- labels
- buttons
- editorial accents

## Spacing system

Define:
- container widths
- section spacing
- component spacing
- mobile spacing
- grid behavior

## Shape system

Define:
- button radii
- card radii
- image radii
- navigation radius
- form radius

Avoid applying the same pill radius to everything.

## Elevation system

Define exactly where shadows/depth are allowed.

## Imagery system

Define visual treatment and image requirements.

## Icon system

Define icon style, stroke, sizing and usage.

## Motion system

Define motion tokens and rules.

---

# Homepage Architecture

Produce a proposed homepage information architecture.

For EVERY homepage section specify:

1. Section name
2. Business purpose
3. Content hierarchy
4. Layout
5. Background/surface
6. Typography
7. Imagery/media
8. CTA
9. Interaction/motion
10. Responsive behavior
11. Reusable components needed
12. Refero/reference rationale

Do not force a predetermined number of sections.

Choose the appropriate number based on the actual Hills Coffee content and existing project.

---

# Other Pages

Inspect the existing routes and identify which other pages need the new system.

For each relevant page, explain:

- what remains
- what changes
- what components are shared
- what page-specific design treatment is required

Do not redesign unrelated application/admin functionality unless the design system requires a shared primitive.

---

# Implementation Roadmap

Create a detailed execution roadmap for the implementation agent.

Break implementation into safe phases.

For example:

- Phase 0 — protect baseline / establish QA
- Phase 1 — tokens and typography
- Phase 2 — navigation / global shell
- Phase 3 — homepage core composition
- Phase 4 — imagery and advanced surfaces
- Phase 5 — motion and interactions
- Phase 6 — responsive refinement
- Phase 7 — remaining public pages
- Phase 8 — accessibility and performance
- Phase 9 — final visual QA

Adapt the phases after inspecting the actual project.

For every phase identify:

- files likely affected
- components to create/change
- dependencies
- acceptance criteria
- regression risks

---

# Testing and QA Plan

The plan MUST include:

## Playwright visual validation

The future implementation agent should use Playwright to inspect the actual rendered site.

Require validation at representative sizes such as:

- 1440px desktop
- 1280px desktop
- 1024px tablet
- 768px tablet
- 390px mobile
- 360px mobile

Validate:

- horizontal overflow
- typography wrapping
- broken layouts
- image cropping
- nav behavior
- CTA visibility
- animation behavior
- section spacing
- focus states
- menu interaction
- important routes

Require screenshots during implementation for visual comparison.

The implementation agent should compare the rendered result against the approved design direction and correct visible design drift.

---

# Preserve Functionality

This is critical.

The future visual redesign must not break:

- routing
- authentication
- Supabase behavior
- forms
- localization if present
- existing data loading
- admin behavior
- pricing/business logic
- existing APIs
- responsive functionality

Separate visual restructuring from business logic changes.

If the existing code makes this difficult, document the risk instead of silently rewriting behavior.

---

# Required Final Output

Write the completed plan to:

`design-berif/HILLS_DESIGN_PLAN.md`

The document should be detailed enough that another implementation agent can execute it without needing to invent the design direction.

The output should contain at minimum:

1. Executive design summary
2. Existing project audit
3. Refero Research Ledger
4. Tomorro Video Study
5. Hills Coffee visual thesis
6. Reference lock
7. Color system
8. Typography system
9. spacing/grid system
10. Shape and elevation system
11. Imagery system
12. Icon system
13. Motion system
14. Navigation specification
15. Homepage architecture
16. Section-by-section specifications
17. Other page adaptation strategy
18. Responsive strategy
19. Accessibility requirements
20. Performance requirements
21. Component inventory
22. Implementation roadmap
23. Playwright testing plan
24. Visual QA checklist
25. Risks / anti-patterns
26. Final implementation handoff checklist

---

# Quality Gate

Before finishing, verify:

- Did I actually use Refero?
- Did I inspect more than one reference?
- Did I inspect the reference video?
- Did I inspect the real repository?
- Is the direction specific to Hills Coffee?
- Is Tomorro inspiration rather than a clone?
- Are design decisions precise enough to implement?
- Is motion defined rather than vaguely requested?
- Are images intentionally specified?
- Is mobile deliberately designed?
- Are accessibility and performance addressed?
- Does the roadmap preserve existing functionality?
- Is Playwright visual QA included?
- Could another coding agent implement this without guessing?

If any answer is no, improve the plan before completing.

Do not implement code.

Only research, analyze, decide, and create:
`design-berif/HILLS_DESIGN_PLAN.md`