import appTypes from "../types";
import type { VerificationRecord } from "../types/verificationTypes";

interface VerificationsState {
  loading: boolean;
  error: string | null;
  successMessage: string | null;
  verifications: VerificationRecord[];
  verification: VerificationRecord | null;
}

const initialState: VerificationsState = {
  loading: false,
  error: null,
  successMessage: null,
  verifications: [],
  verification: null,
};

export const verificationsReducer = (
  state = initialState,
  action: any
): VerificationsState => {
  switch (action.type) {
    case "VERIFICATION_LOADING":
      return { ...state, loading: true, error: null, successMessage: null };

    case "VERIFICATION_SUCCESS":
      return { ...state, loading: false, successMessage: action.payload };

    case "VERIFICATION_ERROR":
      return { ...state, loading: false, error: action.payload };

    case appTypes.verifications.FETCH_VERIFICATIONS_SUCCESS:
      return { ...state, verifications: action.payload };

    case appTypes.verifications.CREATE_VERIFICATION_SUCCESS:
      return {
        ...state,
        verifications: [...state.verifications, action.payload],
      };
    case appTypes.verifications.FETCH_VERIFICATION_BY_ID_REQUEST:
      return {
        ...state,
        verification: action.payload,
      };

    default:
      return state;
  }
};
