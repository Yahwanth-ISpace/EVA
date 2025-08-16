import { useEffect, useState } from "react";
import { createAppointment, fetchOffices, fetchProviders } from "../api";
import Container from "../components/Container";
import Icon from "../components/Icons";
import Navbar from "../components/Navbar";
import type {
  Appointment,
  Office,
  PatientInfo,
  Provider,
} from "../types/insurance";
import { useAuth } from "../utils/AuthContext";
import { useNavigate } from "react-router-dom";

const defaultData: Appointment = {
  name: "",
  dob: "",
  payeeId: "",
  providerId: "",
  officeId: "",
  date: "",
  notes: "",
};

type FormErrors = Partial<
  Record<keyof PatientInfo | "appointmentDate" | "appointmentTime", string>
>;

export default function AppointmentForm() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [appointmentDate, setAppointmentDate] = useState<string>("");
  const [appointmentTime, setAppointmentTime] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [formData, setFormData] = useState<Appointment>({
    ...defaultData,
    payeeId: user?.payeeId || "",
    name: user ? `${user.firstName} ${user.lastName}` : "",
    dob: user?.dob ? new Date(user.dob).toISOString().split("T")[0] : "",
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [providerHospital, setProviderHospital] = useState<Provider[]>([]);
  const [providerOffices, setProviderOffices] = useState<Office[]>([]);

  // Load providers list
  useEffect(() => {
    fetchProviders().then(setProviderHospital).catch(console.error);
  }, []);

  // Load offices when hospital changes
  useEffect(() => {
    if (!formData.providerId) {
      setProviderOffices([]);
      return;
    }
    fetchOffices(formData.providerId)
      .then(setProviderOffices)
      .catch(console.error);
  }, [formData.providerId]);

  const validateStep1 = () => {
    const newErrors: FormErrors = {};
    if (!formData.name.trim()) newErrors.name = "Name is required";
    if (!formData.dob) newErrors.dob = "Date of birth is required";
    if (!formData.providerId) newErrors.providerId = "Select a hospital";
    if (!formData.officeId) newErrors.officeId = "Select an office";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateStep2 = () => {
    const newErrors: FormErrors = {};
    if (!appointmentDate)
      newErrors.appointmentDate = "Appointment date is required";
    if (!appointmentTime)
      newErrors.appointmentTime = "Appointment time is required";
    // Optional: require notes if you want
    // if (!notes.trim()) newErrors.notes = "Please provide visit details";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    if (name === "providerId") {
      setFormData((prev) => ({
        ...prev,
        providerId: value,
        officeId: "", // reset officeId when provider changes
      }));
      return;
    }

    if (name === "officeId") {
      setFormData((prev) => ({
        ...prev,
        officeId: value,
      }));
      return;
    }
  };

  const handleSubmit = async () => {
    if (!validateStep2()) return;

    setLoading(true);
    setStatus("");
    try {
      const combinedDateTime = new Date(
        `${appointmentDate}T${appointmentTime}`
      ).toISOString();

      // Build payload explicitly excluding name and dob
      const { name, dob, ...payloadRest } = formData;

      const payload = {
        ...payloadRest,
        date: combinedDateTime,
        notes,
      };

      const result = await createAppointment(payload);
      setStatus(result?.status || "Submitted successfully");
      setFormData(defaultData);
      setAppointmentDate("");
      setAppointmentTime("");
      setNotes("");
      setStep(1);

      navigate("/dashboard");
    } catch (err) {
      console.error(err);
      setStatus("Submission failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="PatientForm">
      <Navbar />
      <div className="section-wrapper flex flex-col gap-y-3 mt-5">
        <div className="buttonWrapper max-w-7xl w-full mx-auto px-6">
          <button
            type="button"
            className="text-gray-500 hover:text-gray-700 transition flex items-center gap-x-3 w-400"
            onClick={() => window.history.back()}
          >
            <Icon iconName="leftArrow" iconColor="currentColor" size="xs" />
            <h4 className="font-mono text-lg tracking-[0.2em]">Back</h4>
          </button>
        </div>

        <Container className="h-100 pb-8">
          {step === 1 && (
            <>
              <div className="w-full max-w-2xl bg-white p-5 py-2">
                <h2 className="text-2xl font-bold text-gray-800 mb-8 text-left">
                  Schedule an Appointment
                </h2>

                <div className="space-y-6">
                  {/* Step 1 Form */}
                  <div>
                    {/* Full Name */}
                    <label className="block text-sm font-medium mb-1">
                      Full Name
                    </label>
                    <input
                      id="name"
                      name="name"
                      type="text"
                      value={formData.name}
                      onChange={handleChange}
                      className={`w-full border px-4 py-3 rounded-md focus:outline-none focus:ring-2 ${
                        errors.name
                          ? "border-red-500 focus:ring-red-500"
                          : "border-gray-300 focus:ring-blue-500"
                      }`}
                    />
                    {errors.name && (
                      <p className="text-sm text-red-500">{errors.name}</p>
                    )}
                  </div>

                  {/* DOB */}
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Date of Birth
                    </label>
                    <input
                      id="dob"
                      name="dob"
                      type="date"
                      value={formData.dob}
                      onChange={handleChange}
                      className={`w-full border px-4 py-3 rounded-md focus:outline-none focus:ring-2 ${
                        errors.dob
                          ? "border-red-500 focus:ring-red-500"
                          : "border-gray-300 focus:ring-blue-500"
                      }`}
                    />
                    {errors.dob && (
                      <p className="text-sm text-red-500">{errors.dob}</p>
                    )}
                  </div>

                  {/* Hospital */}
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Choose Treatment Hospital
                    </label>
                    <select
                      id="providerId"
                      name="providerId"
                      value={formData.providerId}
                      onChange={handleChange}
                      className={`w-full border px-4 py-3 rounded-md focus:outline-none focus:ring-2 ${
                        errors.providerId
                          ? "border-red-500 focus:ring-red-500"
                          : "border-gray-300 focus:ring-blue-500"
                      }`}
                    >
                      <option value="">Select a hospital</option>
                      {providerHospital.map((hospital) => (
                        <option key={hospital.id} value={hospital.id}>
                          {hospital.firstName} {hospital.lastName} |{" "}
                          {hospital.specialty}
                        </option>
                      ))}
                    </select>
                    {errors.providerId && (
                      <p className="text-sm text-red-500">
                        {errors.providerId}
                      </p>
                    )}
                  </div>

                  {/* Office */}
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Hospital Office
                    </label>
                    <select
                      id="officeId"
                      name="officeId"
                      value={formData.officeId}
                      onChange={handleChange}
                      disabled={!formData.providerId}
                      className={`w-full border px-4 py-3 rounded-md focus:outline-none focus:ring-2 ${
                        errors.officeId
                          ? "border-red-500 focus:ring-red-500"
                          : "border-gray-300 focus:ring-blue-500"
                      }`}
                    >
                      <option value="">Select an office</option>
                      {providerOffices.map((office) => (
                        <option key={office.id} value={office.id}>
                          {office.name}
                        </option>
                      ))}
                    </select>
                    {errors.officeId && (
                      <p className="text-sm text-red-500">{errors.officeId}</p>
                    )}
                  </div>
                </div>
              </div>
              {/* Next Button */}
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => {
                    if (validateStep1()) setStep(2);
                  }}
                  className="text-white px-5 py-2 rounded-md bg-indigo-600 hover:bg-indigo-700 w-28"
                >
                  Next
                </button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="w-full max-w-2xl bg-white p-5 py-2">
                <h2 className="text-2xl font-bold mb-6">
                  Select Appointment Date & Time
                </h2>

                {/* Date */}
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-1">Date</label>
                  <input
                    type="date"
                    value={appointmentDate}
                    onChange={(e) => setAppointmentDate(e.target.value)}
                    className={`w-full border px-4 py-3 rounded-md focus:outline-none focus:ring-2 ${
                      errors.appointmentDate
                        ? "border-red-500 focus:ring-red-500"
                        : "border-gray-300 focus:ring-blue-500"
                    }`}
                  />
                  {errors.appointmentDate && (
                    <p className="text-sm text-red-500">
                      {errors.appointmentDate}
                    </p>
                  )}
                </div>

                {/* Time */}
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-1">Time</label>
                  <input
                    type="time"
                    value={appointmentTime}
                    onChange={(e) => setAppointmentTime(e.target.value)}
                    className={`w-full border px-4 py-3 rounded-md ${
                      errors.appointmentTime
                        ? "border-red-500"
                        : "border-gray-300"
                    }`}
                  />
                  {errors.appointmentTime && (
                    <p className="text-sm text-red-500">
                      {errors.appointmentTime}
                    </p>
                  )}
                </div>

                {/* Notes */}
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-1">
                    Notes
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Enter details about your visit"
                    className="w-full border rounded px-3 py-2"
                  />
                </div>
              </div>
              {/* Actions */}
              <div className="flex justify-between">
                <button
                  type="button"
                  className="px-5 py-2 rounded-md bg-gray-300 hover:bg-gray-400 w-28"
                  onClick={() => setStep(1)}
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={handleSubmit}
                  className={`px-5 py-2 rounded-md bg-green-600 hover:bg-green-700 text-white ${
                    loading ? "opacity-70 cursor-not-allowed" : ""
                  }`}
                >
                  {loading ? "Booking..." : "Book Appointment"}
                </button>
              </div>

              {status && (
                <p
                  className={`mt-4 text-center ${
                    status.toLowerCase().includes("fail")
                      ? "text-red-600"
                      : "text-green-600"
                  }`}
                >
                  {status}
                </p>
              )}
            </>
          )}
        </Container>
      </div>
    </div>
  );
}
