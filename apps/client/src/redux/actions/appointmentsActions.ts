import type { Dispatch } from "redux";
import { api } from "../../utils/api";
import appTypes from "../types/index";
import type {
  AppointmentRecord,
  CreateAppointmentPayload,
} from "../types/appointmentsTypes";

const withLoading = async <T>(
  dispatch: Dispatch,
  asyncFn: () => Promise<T>,
  successType: string,
  successMessage: string,
  failureType?: string
) => {
  dispatch({ type: "APPOINTMENT_LOADING" });
  try {
    const result = await asyncFn();
    dispatch({ type: successType, payload: result });
    dispatch({ type: "APPOINTMENT_SUCCESS", payload: successMessage });
  } catch (err: any) {
    dispatch({
      type: failureType || "APPOINTMENT_ERROR",
      payload: err.message,
    });
  }
};

// Get all appointments
export const getAppointments = () => async (dispatch: Dispatch) =>
  withLoading<AppointmentRecord[]>(
    dispatch,
    () => api.get<AppointmentRecord[]>("/appointments"),
    appTypes.appointments.FETCH_APPOINTMENTS_SUCCESS,
    "Appointments fetched",
    appTypes.appointments.FETCH_APPOINTMENTS_FAILURE
  );

export const deleteAppointment = (id: string) => async (dispatch: Dispatch) =>
  withLoading<null>(
    dispatch,
    () => api.delete(`/appointments/${id}`),
    appTypes.appointments.DELETE_APPOINTMENT_SUCCESS,
    "Appointment deleted",
    appTypes.appointments.DELETE_APPOINTMENT_FAILURE
  );

// Add a new appointment
export const addAppointment =
  (payload: CreateAppointmentPayload) => async (dispatch: Dispatch) =>
    withLoading<AppointmentRecord>(
      dispatch,
      () => api.post<AppointmentRecord>("/appointments", payload),
      appTypes.appointments.CREATE_APPOINTMENT_SUCCESS,
      "Appointment created",
      appTypes.appointments.CREATE_APPOINTMENT_FAILURE
    );
