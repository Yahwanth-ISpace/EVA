import { api } from "../../utils/api";
import type { AppointmentRecord } from "../types/appointmentsTypes";
import type { InsuranceRecord } from "../types/insuranceTypes";
import apptypes from "../types";
import type { VerificationRecord } from "../types/verificationTypes";

// action creators
export const getVerifications = () => async (dispatch: any) => {
  dispatch({ type: apptypes.verifications.FETCH_VERIFICATIONS_REQUEST });
  try {
    const data = await api.get<InsuranceRecord[]>("/verifications");
    dispatch({
      type: apptypes.verifications.FETCH_VERIFICATIONS_SUCCESS,
      payload: data,
    });
  } catch (error: any) {
    dispatch({
      type: apptypes.verifications.FETCH_VERIFICATIONS_FAILURE,
      payload: error.message,
    });
  }
};

export const addVerification =
  (payload: AppointmentRecord) => async (dispatch: any) => {
    dispatch({ type: apptypes.verifications.SUBMIT_VERIFICATION_REQUEST });
    try {
      const data = await api.post<InsuranceRecord>("/verifications", payload);
      dispatch({
        type: apptypes.verifications.SUBMIT_VERIFICATION_SUCCESS,
        payload: data,
      });
    } catch (error: any) {
      dispatch({
        type: apptypes.verifications.SUBMIT_VERIFICATION_FAILURE,
        payload: error.message,
      });
    }
  };

export const deleteVerification = (id: string) => async (dispatch: any) => {
  dispatch({ type: apptypes.verifications.DELETE_VERIFICATION_REQUEST });
  try {
    const data = await api.delete<InsuranceRecord>(`/verifications/${id}`);
    dispatch({
      type: apptypes.verifications.DELETE_VERIFICATION_SUCCESS,
      payload: data,
    });
  } catch (error: any) {
    dispatch({
      type: apptypes.verifications.DELETE_VERIFICATION_FAILURE,
      payload: error.message,
    });
  }
};

export const getVerificationById = (id: string) => async (dispatch: any) => {
  dispatch({ type: apptypes.verifications.FETCH_VERIFICATION_BY_ID_REQUEST });
  try {
    const data = await api.get<VerificationRecord>(`/verifications/${id}`);
    dispatch({
      type: apptypes.verifications.FETCH_VERIFICATION_BY_ID_SUCCESS,
      payload: data,
    });
  } catch (error: any) {
    dispatch({
      type: apptypes.verifications.FETCH_VERIFICATION_BY_ID_FAILURE,
      payload: error.message,
    });
  }
};
