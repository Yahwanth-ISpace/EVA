import { useNavigate } from "react-router-dom";
import unAuthorizedIcon from "../assets/unauthorised.svg";

export default function UnauthorizedPage() {
  const navigate = useNavigate();

  return (
    <div className="h-full w-full flex flex-col items-center justify-center my-auto bg-gray-100 px-6 overflow-hidden">
      {/* <Lock size={60} className="text-indigo-600 mb-4" /> */}
      <img src={unAuthorizedIcon} alt="" className="w-80 h-80" />
      <h1 className="text-3xl font-bold text-gray-800 mb-2">Access Denied</h1>
      <p className="text-gray-600 mb-6 text-center max-w-md">
        You do not have the necessary permissions to view this page. If you
        believe this is an error, please contact your administrator.
      </p>
      <button
        onClick={() => navigate("/")}
        className="px-6 py-3 bg-indigo-600 text-white rounded-md font-semibold hover:bg-indigo-700 transition"
      >
        Go to Home
      </button>
    </div>
  );
}
