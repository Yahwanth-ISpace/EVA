// apps/client/src/components/Register.tsx
import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAppDispatch, useAppSelector } from "../utils/hooks";
import { register } from "../redux/actions/authActions"; // <-- thunk

export default function Register() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  const { loading, error } = useAppSelector((state) => state.authState);

  const [formData, setFormData] = useState<{
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    dob: string;
    role: "PAYEE" | "ADMIN";
  }>({
    email: "",
    password: "",
    firstName: "",
    lastName: "",
    dob: "",
    role: "PAYEE",
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await dispatch(
        register({
          ...formData,
          dob: formData.dob ? new Date(formData.dob) : undefined,
        }) as any // because your thunk returns a function
      );

      navigate("/login");
    } catch (err) {
      console.error("Registration failed:", err);
    }
  };

  return (
    <div className="max-w-md mx-auto mt-10 p-6 bg-white shadow-md rounded-lg">
      <h2 className="text-xl font-semibold mb-4">Register</h2>

      {error && <p className="text-red-500 mb-4">{error}</p>}

      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          name="email"
          type="email"
          value={formData.email}
          onChange={handleChange}
          placeholder="Email"
          required
          className="w-full border px-3 py-2 rounded"
        />
        <input
          name="password"
          type="password"
          value={formData.password}
          onChange={handleChange}
          placeholder="Password (min 6 characters)"
          minLength={6}
          required
          className="w-full border px-3 py-2 rounded"
        />
        <input
          name="firstName"
          type="text"
          value={formData.firstName}
          onChange={handleChange}
          placeholder="First Name"
          required
          className="w-full border px-3 py-2 rounded"
        />
        <input
          name="lastName"
          type="text"
          value={formData.lastName}
          onChange={handleChange}
          placeholder="Last Name"
          required
          className="w-full border px-3 py-2 rounded"
        />
        <input
          name="dob"
          type="date"
          value={formData.dob ?? ""}
          onChange={handleChange}
          className="w-full border px-3 py-2 rounded"
        />

        <select
          name="role"
          value={formData.role}
          onChange={handleChange}
          className="w-full border px-3 py-2 rounded"
        >
          <option value="PAYEE">Payee</option>
          <option value="ADMIN">Admin</option>
        </select>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:bg-blue-400"
        >
          {loading ? "Registering..." : "Register"}
        </button>
      </form>

      <p className="mt-4 text-center">
        Already have an account?{" "}
        <Link to="/login" className="text-blue-600 hover:underline">
          Login here
        </Link>
      </p>
    </div>
  );
}
