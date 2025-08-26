// src/components/RoleWrapper.tsx
import { useSelector } from "react-redux";
import type { RootState } from "../redux/store";

interface RoleProps {
  role: string;
  children: React.ReactNode;
}

export function Role({ role, children }: RoleProps) {
  const { user } = useSelector((state: RootState) => state.authState);
  if (!user || user.role !== role) {
    return null;
  }
  return <>{children}</>;
}
