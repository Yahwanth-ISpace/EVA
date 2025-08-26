import { useNavigate } from "react-router-dom";

export default function ErrorPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-6">
      {/* <AlertTriangle size={60} className="text-red-500 mb-4" /> */}
      <h1 className="text-3xl font-bold text-gray-800 mb-2">
        Something went wrong
      </h1>
      <p className="text-gray-600 mb-6 text-center max-w-md">
        We're facing some trouble processing your request. Please try again or contact support if the issue continues.
      </p>
      <button
        onClick={() => navigate("/")}
        className="px-6 py-3 bg-red-500 text-white rounded-md font-semibold hover:bg-red-600 transition"
      >
        Return to Home
      </button>
    </div>
  );
}
