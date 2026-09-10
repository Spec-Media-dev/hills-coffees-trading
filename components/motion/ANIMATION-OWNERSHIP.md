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

GSAP is only created inside a `gsap.context()` scoped to a mounted element — via `useGsapTimeline`, or
directly in a component's own `useLayoutEffect` as `AnimatedHero` and `InteractiveStorySection` do.
Every context is reverted and every timeline killed on unmount, so a mount -> unmount -> remount cycle
leaves the global timeline child count unchanged.

**Property ownership is per surface, not global.** `Reveal`, `Presence` and `HoverLift` are Motion
surfaces, so GSAP must never write opacity or translate-y on *those* nodes. On a surface that is
GSAP-owned end to end — the hero entrance and the story advance — Motion is not mounted at all, so
GSAP owns opacity and transform there without any conflict. The invariant is one engine per
interaction and one owner per rendered property, never a globally reserved property list.

Lenis is not initialized.
