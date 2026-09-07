# Auth & KYB UI kit

Shared entry surface for buyers and sellers (Master Guide §08). There is no combined
Seller/Buyer role in this release — the role choice happens once, at registration.

Open `index.html`. A pill row at the top switches between all six screens, and
`ApplicationStatus` has its own switcher for every application state.

## Screens
| File | Screen |
| --- | --- |
| `auth-chrome.jsx` | Split brand/form shell with language + theme controls |
| `login.jsx` | Email + password, error state, forgot-password link |
| `auth-more.jsx` → `ForgotPassword` | Request link → link sent → set new password |
| `role-select.jsx` | Buyer vs Seller choice with the difference explained, plus account fields |
| `auth-more.jsx` → `EmailVerification` | Six-digit code with sent / error / verified states |
| `kyb-wizard.jsx` | Six-step KYB wizard: company, ownership, contact, banking & evidence, agreements, review |
| `application-status.jsx` | Every application state: submitted, under review, more info, approved, rejected, suspended |

The wizard demonstrates the guide's UX rule: never one long form. Autosave note, per-step
state, document checklist, and — when more information is required — the exact missing
items with a direct CTA.
