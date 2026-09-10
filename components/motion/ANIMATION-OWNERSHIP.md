# Animation ownership registry

One interaction has one engine, and one rendered property has one owner. Later Feature 002 blocks must extend this table before adding an animated surface.

| Surface | Interaction | Primary engine | Owned properties |
|---|---|---|---|
| Button / IconButton | hover, press, focus, disabled feedback | CSS token layer | color, background-color, border-color, box-shadow, transform |
| Form controls | hover, focus, validation feedback | CSS token layer | background-color, border-color, box-shadow |
| Card / Panel | stateless hover surface feedback | CSS token layer | box-shadow, border-color |
| Tabs / breadcrumb / pagination / sort | hover, focus, active indication | CSS token layer | color, background-color, border-color, opacity |
| Dialog | enter and exit | CSS token layer | opacity, transform |
| Drawer | enter and exit from inline-end | CSS token layer | opacity, transform |
| Toast | enter and exit | Sonner CSS layer | opacity, transform |
| Skeleton | loading pulse | CSS token layer | opacity |
| Reveal | viewport entrance | Motion | opacity, translate-y |
| Presence | component/image enter and exit | Motion | opacity |
| HoverLift | interactive card hover lift | Motion | translate-y |
| Story timeline | seekable, multi-step synchronised sequence | GSAP | clip-path, x-percent, timeline progress |
| AnimatedHero (UIF-024) | hero entrance sequence | GSAP | clip-path, scale, opacity, translate-y |
| InteractiveStorySection (UIF-054) | timed item advance: rail fill + active state + image crossfade | GSAP | scaleY, opacity, scale |
| OriginsShowcase (UIF-055) | horizontal slide advance | Native scroll (CSS scroll-snap + `scrollTo`) | scroll position |
| CatalogueFilter (UIF-030) | chip / result state feedback | CSS token layer | color, background-color, border-color |
| SiteHeader (convergence) | dark-glass to surface emergence over a dark page opener | CSS scroll-driven animation (`--hdr-p`) | background-color, border-color, box-shadow, color, opacity (lockup cross-fade) |
| SiteHeader flyouts (convergence) | panel open / close on hover and focus-within | CSS token layer | opacity, translate, visibility |
| Hero media wrapper (convergence) | decorative scroll drift as the hero leaves the viewport | CSS scroll-driven animation | translate (on `[data-hero-parallax]` only; the images inside stay GSAP-owned for the entrance) |
| IntentCards (convergence) | photograph reveal and ink change on hover / focus | CSS token layer | opacity, transform (image scale), color, width (gold rule) |
| IntentCards / CoffeeShowcase / About pillars / Contact intents | viewport entrance | Motion (`Reveal`) | opacity, translate-y |
| CoffeeMarquee (convergence) | continuous strip travel; pause on hover / focus | CSS keyframes | transform (track) |
| GsapScrollReveal (convergence, island-5 helper) | connector draw + step stagger as one sequence (TraceabilityBand, ProcessJourney) | GSAP | scaleX / scaleY on `[data-draw]`, opacity + y on `[data-step]` |
| FinalCta (convergence) | quiet entrance | Motion (`Reveal`) | opacity, translate-y |

GSAP is only created inside a `gsap.context()` scoped to a mounted element — via `useGsapTimeline`, or
directly in a component's own `useLayoutEffect` as `AnimatedHero` and `InteractiveStorySection` do.
Every context is reverted and every timeline killed on unmount, so a mount -> unmount -> remount cycle
leaves the global timeline child count unchanged.

**Property ownership is per surface, not global.** `Reveal`, `Presence` and `HoverLift` are Motion
surfaces, so GSAP must never write opacity or translate-y on *those* nodes. On a surface that is
GSAP-owned end to end — the hero entrance and the story advance — Motion is not mounted at all, so
GSAP owns opacity and transform there without any conflict. The invariant is one engine per
interaction and one owner per rendered property, never a globally reserved property list.

**Derived state is not a second engine.** `OriginsShowcase`'s progress indicator is read back from
the track's real `scrollLeft` on every scroll event rather than animated in parallel. That keeps one
mechanism in charge of the advance, so the bar cannot drift from the track, momentum and trackpad
gestures stay accurate, and there is no timeline to leak. Animating the indicator with GSAP or Motion
alongside a native scroll would have put two engines on one interaction.

**Wrapper exclusivity.** A subtree wrapped by `GsapScrollReveal` never contains a Motion `Reveal`,
and vice versa: the traceability chain and the journey path are GSAP end to end, while the intent
columns, showcase panels and final CTA are Motion end to end. CSS hover states inside either are
stateless transitions on properties the entrance sequence does not animate on the same node.

Lenis is not initialized.
