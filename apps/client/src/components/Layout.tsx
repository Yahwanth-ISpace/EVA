import { Outlet } from "react-router-dom";

export default function Layout() {
  return (
    <div className="main-container min-h-screen w-screen bg-[#F7F8FA]">
      <div className="min-h-screen text-gray-900 px-6 pt-4 max-w-7xl mx-auto">
        <Outlet />
      </div>
    </div>
  );
}
