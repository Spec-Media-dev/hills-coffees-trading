# Shared portal screens

Surfaces the Buyer, Seller and Admin portals share (Master Guide §14).

| File | Exports | Loaded by |
| --- | --- | --- |
| `account-settings.jsx` | `AccountSettings` — profile, company, security, notifications, theme & language | `buyer_portal`, `seller_portal` |

`AccountSettings` takes `role` ("Buyer" / "Seller") and expects the host kit to have
defined `PageHead`. Sensitive commercial fields (legal name, registration, banking) are
read-only; changing them requires a new KYB review or step-up approval.

The Admin workspace has its own variant (`AdminSettings` in
`ui_kits/admin_workspace/admin-more.jsx`) because it adds notification routing and
workspace defaults instead of company data.

Kit files are compiled into the design-system bundle along with everything else, so they
must stay side-effect-free: define components, export them onto `window`, and leave the
`ReactDOM.createRoot` mount to the inline script at the end of each kit's `index.html`.
