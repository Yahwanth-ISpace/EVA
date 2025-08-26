import { useSelector } from "react-redux";
import { useLocation, useNavigate } from "react-router-dom";

import Logo from "../assets/logo1.png";
import Icon from "./Icons";

import type { RootState } from "../redux/store";
import { logout } from "../redux/actions/authActions";

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();

  const { user } = useSelector((state: RootState) => state.authState);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <nav className="flex items-center justify-between" aria-labelledby="navbar">
      {/* Left Side - Logo + App Name + User Info */}

      <div className="wrapper flex items-center justify-between gap-1 divide-x-2 divide-gray-400">
        <div className="flex items-center gap-3">
          <div className="logo bg-[#4f39f6] rounded-xl">
            <img src={Logo} className="w-10 h-10" alt="" />
          </div>
          <div className="titleWrapper flex flex-col text-center">
            <h1 className="text-3xl font-bold text-gray-900 pr-5 text-center">
              CovrAi
            </h1>
            {/* <hr className="text-gray-400" />
                <h3 className="text-xs text-gray-500 font-mono mt-1 tracking-widest">
                  Dashboards Re-Imagined
                </h3> */}
          </div>
        </div>

        {/* Logged-in user details */}
        {user && (
          <div className="userDetails pl-5">
            <div className="userNameRole flex items-center gap-2">
              <h3 className="text-xl text-black font-semibold capitalize">
                {user.firstName} {user.lastName}
              </h3>
              <h3 className="text-xs text-gray-500 font-mono capitalize mt-1">
                {"| " + user.role}
              </h3>
            </div>
            <div className="userEmail">
              <h3 className="text-xs text-gray-500 font-mono mt-1">
                {user.email}
              </h3>
            </div>
          </div>
        )}
      </div>

      {/* Right Side - Actions */}
      <div className="wrapper flex gap-3 items-center">
        {location.pathname !== "/appointment-form" && (
          <button
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg shadow transition-all outline-none"
            onClick={() => navigate("/appointment-form")}
          >
            Book Appointment
          </button>
        )}
        <Icon iconName="logout" iconColor="" size="sm" onClick={handleLogout} />
      </div>
    </nav>
  );
}
