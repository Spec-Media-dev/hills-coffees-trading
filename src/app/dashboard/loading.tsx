import { StateScreen } from "@/components/layout/state-screen";

/**
 * Member Portal loading state (Next.js route-segment convention). Server Component — reuses the
 * shared StateScreen so loading, empty, unauthorized and error states all look like one system.
 */
export default function DashboardLoading() {
  return <StateScreen kind="loading" />;
}
