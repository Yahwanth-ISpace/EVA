import appTypes from "../types";
import type { AppointmentRecord } from "../types/appointmentsTypes";

interface AppointmentsState {
  loading: boolean;
  error: string | null;
  successMessage: string | null;
  appointments: AppointmentRecord[];
}

const initialState: AppointmentsState = {
  loading: false,
  error: null,
  successMessage: null,
  appointments: [],
};

export const appointmentsReducer = (
  state = initialState,
  action: any
): AppointmentsState => {
  switch (action.type) {
    case "APPOINTMENT_LOADING":
      return { ...state, loading: true, error: null, successMessage: null };

    case "APPOINTMENT_SUCCESS":
      return { ...state, loading: false, successMessage: action.payload };

    case "APPOINTMENT_ERROR":
      return { ...state, loading: false, error: action.payload };

    case appTypes.appointments.FETCH_APPOINTMENTS_SUCCESS:
      return { ...state, appointments: action.payload };

    case appTypes.appointments.CREATE_APPOINTMENT_SUCCESS:
      return {
        ...state,
        appointments: [...state.appointments, action.payload],
      };

    default:
      return state;
  }
};
