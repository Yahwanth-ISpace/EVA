import { useState } from "react";
import PatientForm from "./components/PatientForm";
import Dashboard from "./pages/Dashboard";

function App() {
  const [view, setView] = useState<"form" | "dashboard">("form");

  return (
    <div
      className="min-h-screen w-screen bg-gray-100"
      style={{
        backgroundImage: "url(https://wallpapercave.com/wp/yaPN3iv.jpg)",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      <header className="bg-blue-700 text-white p-4 text-center text-xl font-semibold">
        Dental Insurance Verifier
      </header>
      <div className="flex justify-center mt-4 space-x-4">
        <button
          onClick={() => setView("form")}
          className="text-blue-600 underline"
        >
          Patient Form
        </button>
        <button
          onClick={() => setView("dashboard")}
          className="text-blue-600 underline"
        >
          Clinic Dashboard
        </button>
      </div>
      {view === "form" ? <PatientForm /> : <Dashboard />}
    </div>
  );
}

export default App;
