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

GSAP may only be created by `useGsapTimeline`, inside `gsap.context()` scoped to a mounted element. The hook kills its timeline and reverts its context on unmount. It must not own opacity or translate-y because Motion owns those properties for reveal/presence surfaces. Lenis is not initialized.
