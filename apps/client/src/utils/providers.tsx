// app/providers.tsx
import { AuthProvider } from "./authContext";

export function Providers({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
