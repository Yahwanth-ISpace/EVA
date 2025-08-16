import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../utils/AuthContext";
import { login as loginAPI } from "../api";
import Logo from "../assets/logo1.png";
import RightCoverBg from "../assets/reception.png";

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");
  const [passwordError, setPasswordError] = useState("");

  const validatePassword = (pwd: string) => {
    if (pwd.length < 6) {
      setPasswordError("Password must be at least 6 characters");
      return false;
    }
    setPasswordError("");
    return true;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validatePassword(password)) return;
    setError("");

    if (!email || !password) {
      setError("Both email and password are required.");
      return;
    }

    try {
      const response = await loginAPI({ email, password });

      if (response.access_token && response.user) {
        const user = response.user;
        const userPayload = {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          dob: user.dob,
          email: user.email,
          role: user.role,
          payeeId: user.payeeId, // optional
        };

        login(response.access_token, userPayload);
        navigate("/dashboard");
      }
    } catch (err) {
      setError("Invalid credentials or server error");
    }
  };

  return (
    <div className="w-screen h-screen flex font-sans p-5  text-gray-900 bg-[#e4e7eeeb]">
      {/* Left Side: Login Form */}
      <div className="w-full md:w-[40%] flex items-center justify-center px-6">
        <div className="w-full max-w-md bg-white p-10 rounded-3xl shadow-2xl space-y-6">
          <div className="text-center">
            <h2 className="text-3xl font-bold font-mono text-gray-900">
              Welcome Back!
            </h2>
            <p className="text-sm text-gray-500 mt-1 font-medium">
              Enter your email and password to access your account
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-sm font-medium mb-1">
                Email
              </label>
              <input
                id="email"
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900 placeholder-gray-400"
                required
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium mb-1"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (passwordError) validatePassword(e.target.value);
                  }}
                  className={`w-full px-4 py-3 border rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900 placeholder-gray-400 ${
                    passwordError ? "border-red-500" : "border-gray-300"
                  }`}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3 text-indigo-600 text-sm font-semibold hover:underline"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
              {passwordError && (
                <p className="text-red-600 text-sm mt-1">{passwordError}</p>
              )}
            </div>

            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={() => setRememberMe(!rememberMe)}
                  className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                />
                <span className="text-gray-700 font-medium">Remember me</span>
              </label>
              {/* Optional: Add Forgot Password Route */}
              {/* <a href="/forgot-password" className="text-indigo-600 hover:underline">Forgot password?</a> */}
            </div>

            {error && (
              <p className="text-center text-red-600 text-sm font-semibold">
                {error}
              </p>
            )}

            <button
              type="submit"
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-md font-semibold transition shadow-md hover:shadow-lg"
            >
              Sign In
            </button>
          </form>

          <p className="text-center text-sm text-gray-700">
            Don’t have an account?{" "}
            <span
              onClick={() => navigate("/signup")}
              className="text-indigo-600 hover:underline cursor-pointer"
            >
              Sign Up
            </span>
          </p>
        </div>
      </div>

      {/* Right Side: Visual / Illustration */}
      <div
        className="hidden md:flex w-[60%] relative overflow-hidden flex-col justify-between p-12 rounded-[3rem] text-white shadow-lg bg-cover bg-center"
        style={{ backgroundImage: `url(${RightCoverBg})` }}
      >
        {/* Dark overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#4f46e5]/80 to-[#1e1b4b]/80 z-0" />

        {/* Content sits above overlay */}
        <div className="relative z-10 flex flex-col justify-between h-full">
          <div className="rightCoverImage">
            <p className="uppercase text-sm font-semibold">
              <img src={Logo} alt="" className="w-20 h-20" />
            </p>
          </div>
          <div className="mb-12">
            <h1 className="text-5xl font-serif font-semibold leading-tight mb-4 drop-shadow-md">
              AI Insurance Claims <br /> Reinvented
            </h1>
            <p className="text-base max-w-sm leading-relaxed text-white/90 drop-shadow-sm">
              Automate insurance verification, manage patient workflows, and
              streamline support with our advanced AI-powered platform.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
