import { useNavigate } from "react-router-dom";
import sessionExpired from "../assets/sessionExpired.svg";

export default function SessionExpiredPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-6">
      <img src={sessionExpired} className="w-100 h-80" alt="" />
      {/* <Clock size={60} className="text-yellow-500 mb-4" /> */}
      <h1 className="text-3xl font-bold text-gray-800 mb-2">Session Expired</h1>
      <p className="text-gray-600 mb-6 text-center max-w-md">
        Your session has expired due to inactivity. Please log in again to
        continue using the platform.
      </p>
      <button
        onClick={() => navigate("/login")}
        className="px-6 py-3 bg-yellow-500 text-white rounded-md font-semibold hover:bg-yellow-600 transition"
      >
        Login Again
      </button>
    </div>
  );
}
