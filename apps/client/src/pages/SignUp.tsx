import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppDispatch, useAppSelector } from "../utils/hooks";
import { register } from "../redux/actions/authActions";

import Logo from "../assets/logo1.png";
import RightCoverBg from "../assets/reception.png";

const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{12,}$/;

export default function SignUp() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { loading, error } = useAppSelector((state) => state.authState);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  const validatePassword = (pwd: string) => {
    if (!PASSWORD_PATTERN.test(pwd)) {
      setPasswordError(
        "Password must be at least 12 characters and include uppercase, lowercase, and a number"
      );
      return false;
    }
    setPasswordError("");
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validatePassword(password)) return;

    const res = await dispatch(
      register({ fullName: fullName.trim(), email, password })
    );
    if (res) navigate("/login");
  };

  return (
    <div className="w-screen h-screen flex font-sans p-5 text-gray-900 bg-[#e4e7eeeb]">
      <div className="w-full md:w-[40%] flex items-start justify-center px-6 py-6 overflow-y-auto">
        <div className="w-full max-w-md bg-white p-8 rounded-3xl shadow-2xl space-y-5">
          <div className="text-center">
            <h2 className="text-3xl font-bold font-mono text-gray-900">
              Create an account
            </h2>
            <p className="text-sm text-gray-500 mt-1 font-medium">
              Sign up as an operator. An administrator links your patient
              profile after registration.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="fullName" className="block text-sm font-medium mb-1">
                Full name
              </label>
              <input
                id="fullName"
                name="fullName"
                type="text"
                placeholder="Enter your full name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900 placeholder-gray-400"
                required
                maxLength={120}
                autoComplete="name"
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium mb-1">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900 placeholder-gray-400"
                required
                autoComplete="email"
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
                  name="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Create a password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (passwordError) validatePassword(e.target.value);
                  }}
                  className={`w-full px-4 py-3 border rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900 placeholder-gray-400 ${
                    passwordError ? "border-red-500" : "border-gray-300"
                  }`}
                  minLength={12}
                  required
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3 text-indigo-600 text-sm font-semibold hover:underline"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
              {passwordError ? (
                <p className="text-red-600 text-sm mt-1">{passwordError}</p>
              ) : (
                <p className="text-xs text-gray-500 mt-1">
                  At least 12 characters with uppercase, lowercase, and a number.
                </p>
              )}
            </div>

            <div>
              <label htmlFor="role" className="block text-sm font-medium mb-1">
                Role
              </label>
              <input
                id="role"
                value="Operator"
                readOnly
                tabIndex={-1}
                aria-readonly="true"
                className="w-full px-4 py-3 border border-gray-200 rounded-md bg-gray-50 text-gray-700"
              />
              <p className="text-xs text-gray-500 mt-1">
                Public signup is for operators only. Administrator accounts are
                not created here.
              </p>
            </div>

            {error && (
              <p className="text-center text-red-600 text-sm font-semibold">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-md font-semibold transition shadow-md hover:shadow-lg disabled:opacity-60"
            >
              {loading ? "Creating account..." : "Sign Up"}
            </button>
          </form>

          <p className="text-center text-sm text-gray-700">
            Already have an account?{" "}
            <span
              onClick={() => navigate("/login")}
              className="text-indigo-600 hover:underline cursor-pointer"
            >
              Sign In
            </span>
          </p>
        </div>
      </div>

      <div
        className="hidden md:flex w-[60%] relative overflow-hidden flex-col justify-between p-12 rounded-[3rem] text-white shadow-lg bg-cover bg-center"
        style={{ backgroundImage: `url(${RightCoverBg})` }}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-[#4f46e5]/80 to-[#1e1b4b]/80 z-0" />
        <div className="relative z-10 flex flex-col justify-between h-full">
          <div className="rightCoverImage">
            <p className="uppercase text-sm font-semibold">
              <img src={Logo} alt="logo" className="w-20 h-20" />
            </p>
          </div>
          <div className="mb-12">
            <h1 className="text-5xl font-serif font-semibold leading-tight mb-4 drop-shadow-md">
              AI Insurance Verifications <br /> Reinvented
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
