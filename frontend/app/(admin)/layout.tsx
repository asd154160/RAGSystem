import AdminLayout from "@/components/layout/admin-layout";
import { ProtectedRoute } from "@/components/layout/protected-route";

export default function AdminGroupLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <AdminLayout>{children}</AdminLayout>
    </ProtectedRoute>
  );
}
