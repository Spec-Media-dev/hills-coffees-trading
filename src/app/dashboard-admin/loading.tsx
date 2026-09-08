import { StateScreen } from "@/components/layout/state-screen";

/**
 * Operations Console loading state (Next.js route-segment convention). Server Component — reuses
 * the shared StateScreen for a consistent state system across both protected surfaces.
 */
export default function DashboardAdminLoading() {
  return <StateScreen kind="loading" />;
}
