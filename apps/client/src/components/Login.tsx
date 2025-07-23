// apps/client/src/components/Login.tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { login } from "../api";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  setError("");
  setIsLoading(true);

  try {
    const response = await login({ email, password });
    if (response.access_token) {
      localStorage.setItem("token", response.access_token);
      localStorage.setItem("userRole", response.user.role); // Store user role
      navigate("/dashboard");
    }
  } catch (err) {
    setError("Invalid email or password");
  } finally {
    setIsLoading(false);
  }
};

  return (
    <div className="max-w-md mx-auto mt-10 p-6 bg-white shadow-md rounded-lg">
      <h2 className="text-xl font-semibold mb-4">Login</h2>
      {error && <p className="text-red-500 mb-4">{error}</p>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          required
          className="w-full border px-3 py-2 rounded"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          required
          className="w-full border px-3 py-2 rounded"
        />
        <button
          type="submit"
          disabled={isLoading}
          className="w-full bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:bg-blue-400"
        >
          {isLoading ? "Logging in..." : "Login"}
        </button>
      </form>
       <p className="mt-4 text-center">
        Don't have an account?{" "}
        <a href="/register" className="text-blue-600 hover:underline">
          Register here
        </a>
      </p>
    </div>
  );
}