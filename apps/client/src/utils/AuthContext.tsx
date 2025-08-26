// src/utils/authContext.tsx
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";

interface PayeeType {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  dob: string;
  ssn?: string | null;
  payerId?: string | null;
}

interface UserType {
  id: string;
  firstName: string;
  lastName: string;
  dob: string;
  email: string;
  role: string;
  payeeId?: string;
  payee?: PayeeType; // nested object from API
}

interface AuthContextType {
  isAuthenticated: boolean;
  role: string | null;
  user: UserType | null;
  loading: boolean;
  login: (token: string, user: UserType) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const [user, setUser] = useState<UserType | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token");
    const savedUser = localStorage.getItem("user");
    const savedRole = localStorage.getItem("role");

    if (token && savedUser && savedRole) {
      setIsAuthenticated(true);
      setUser(JSON.parse(savedUser));
      setRole(savedRole);
    }
    setLoading(false);
  }, []);

  const login = useCallback((token: string, user: UserType) => {
    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(user));
    localStorage.setItem("role", user.role);

    setIsAuthenticated(true);
    setUser(user);
    setRole(user.role);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("role");

    setIsAuthenticated(false);
    setRole(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ isAuthenticated, role, user, loading, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};
