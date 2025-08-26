import appTypes from "../types";
import type { Office } from "../types/officeTypes";

interface OfficesState {
  loading: boolean;
  error: string | null;
  successMessage: string | null;
  offices: Office[];
}

const initialState: OfficesState = {
  loading: false,
  error: null,
  successMessage: null,
  offices: [],
};

export const officesReducer = (
  state = initialState,
  action: any
): OfficesState => {
  switch (action.type) {
    case "OFFICE_LOADING":
      return { ...state, loading: true, error: null, successMessage: null };

    case "OFFICE_SUCCESS":
      return { ...state, loading: false, successMessage: action.payload };

    case "OFFICE_ERROR":
      return { ...state, loading: false, error: action.payload };

    case appTypes.offices.FETCH_OFFICES_SUCCESS:
      return { ...state, offices: action.payload };

    case appTypes.offices.CREATE_OFFICE_SUCCESS:
      return { ...state, offices: [...state.offices, action.payload] };

    default:
      return state;
  }
};
