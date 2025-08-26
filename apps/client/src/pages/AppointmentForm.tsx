import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import Container from "../components/Container";
import Icon from "../components/Icons";
import Navbar from "../components/Navbar";
import type { RootState } from "../redux/store"; // adjust path based on your store setup
import type {
  Appointment,
  PatientInfo,
} from "../redux/types/appointmentsTypes";
// adjust path based on your store setup
import { addAppointment } from "../redux/actions/appointmentsActions";
import { getOffices } from "../redux/actions/officesActions";
import { getProviders } from "../redux/actions/providerActions";
import type { Office } from "../redux/types/officeTypes";
import type { Provider } from "../redux/types/providerTypes";

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
  const navigate = useNavigate();
  const dispatch = useDispatch();

  // Redux state
  const { user } = useSelector((state: RootState) => state.authState);
  const { providers } = useSelector((state: RootState) => state.providersState);
  const { offices } = useSelector((state: RootState) => state.officesState);
  const { loading, error } = useSelector(
    (state: RootState) => state.appointmentsState
  );

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

  // Load providers list
  useEffect(() => {
    dispatch(getProviders() as any);
  }, [dispatch]);

  // Load offices when hospital changes
  useEffect(() => {
    if (formData.providerId) {
      dispatch(getOffices(formData.providerId) as any);
    }
  }, [formData.providerId, dispatch]);

  const validateStep1 = () => {
    const newErrors: FormErrors = {};
    if (!formData.name.trim()) {
      newErrors.name = "Name is required";
    }
    if (!formData.dob) {
      newErrors.dob = "Date of birth is required";
    }
    if (!formData.providerId) {
      newErrors.providerId = "Select a hospital";
    }
    if (!formData.officeId) {
      newErrors.officeId = "Select an office";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateStep2 = () => {
    const newErrors: FormErrors = {};
    if (!appointmentDate) {
      newErrors.appointmentDate = "Appointment date is required";
    }
    if (!appointmentTime) {
      newErrors.appointmentTime = "Appointment time is required";
    }
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
        officeId: "",
      }));
    } else if (name === "officeId") {
      setFormData((prev) => ({ ...prev, officeId: value }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async () => {
    if (!validateStep2()) {
      return;
    }

    setStatus("");
    try {
      const combinedDateTime = new Date(
        `${appointmentDate}T${appointmentTime}`
      ).toISOString();

      const { name, dob, ...payloadRest } = formData;

      const payload = {
        ...payloadRest,
        date: combinedDateTime,
        notes,
      };

      await dispatch(addAppointment(payload) as any);
      setStatus("Appointment booked successfully!");
      setFormData(defaultData);
      setAppointmentDate("");
      setAppointmentTime("");
      setNotes("");
      setStep(1);
      navigate("/dashboard");
    } catch {
      setStatus("Submission failed. Please try again.");
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
          {/* STEP 1 */}
          {step === 1 && (
            <>
              <div className="w-full max-w-2xl bg-white p-5 py-2">
                <h2 className="text-2xl font-bold text-gray-800 mb-8 text-left">
                  Schedule an Appointment
                </h2>

                <div className="space-y-6">
                  {/* Full Name */}
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Full Name
                    </label>
                    <input
                      id="name"
                      name="name"
                      type="text"
                      value={formData.name}
                      disabled
                      className="w-full border px-4 py-3 rounded-md bg-gray-100"
                    />
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
                      disabled
                      className="w-full border px-4 py-3 rounded-md bg-gray-100"
                    />
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
                      className={`w-full border px-4 py-3 rounded-md ${
                        errors.providerId ? "border-red-500" : "border-gray-300"
                      }`}
                    >
                      <option value="">Select a hospital</option>
                      {providers.map((hospital: Provider) => (
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
                      className={`w-full border px-4 py-3 rounded-md ${
                        errors.officeId ? "border-red-500" : "border-gray-300"
                      }`}
                    >
                      <option value="">Select an office</option>
                      {offices
                        .filter(
                          (office: Office) =>
                            office.providerId === formData.providerId
                        )
                        .map((office: Office) => (
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

          {/* STEP 2 */}
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
                    className={`w-full border px-4 py-3 rounded-md ${
                      errors.appointmentDate
                        ? "border-red-500"
                        : "border-gray-300"
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
              {error && (
                <p className="mt-4 text-center text-red-600">{error}</p>
              )}
            </>
          )}
        </Container>
      </div>
    </div>
  );
}
