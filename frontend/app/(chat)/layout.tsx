import { ProtectedRoute } from "@/components/layout/protected-route";

export default function ChatGroupLayout({ children }: { children: React.ReactNode }) {
  return <ProtectedRoute>{children}</ProtectedRoute>;
}
