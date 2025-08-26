import payeeTypes from "../types/payeeTypes";
import type { Payee } from "../types/payeeTypes";

interface PayeeState {
  loading: boolean;
  error: string | null;
  successMessage: string | null;
  payees: Payee[];
  payee: Payee | null;
}

const initialState: PayeeState = {
  loading: false,
  error: null,
  successMessage: null,
  payees: [],
  payee: null,
};

export const payeeReducer = (state = initialState, action: any): PayeeState => {
  switch (action.type) {
    case payeeTypes.PAYEE_LOADING:
      return { ...state, loading: true, error: null, successMessage: null };

    case payeeTypes.PAYEE_SUCCESS:
      return { ...state, loading: false, successMessage: action.payload };

    case payeeTypes.PAYEE_ERROR:
      return { ...state, loading: false, error: action.payload };

    case payeeTypes.FETCH_PAYEES_SUCCESS:
      return { ...state, payees: action.payload };

    case payeeTypes.FETCH_PAYEE_SUCCESS:
      console.log(action.payload.data);
      return {
        ...state,
        payee: action.payload,
      };

    case payeeTypes.CREATE_PAYEE_SUCCESS:
      return { ...state, payees: [...state.payees, action.payload] };

    case payeeTypes.UPDATE_PAYEE_SUCCESS:
      return {
        ...state,
        payees: state.payees.map((p) =>
          p.id === action.payload.id ? action.payload : p
        ),
      };

    default:
      return state;
  }
};
