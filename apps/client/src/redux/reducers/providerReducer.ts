import appTypes from "../types";
import type { Provider } from "../types/providerTypes";

interface ProvidersState {
  loading: boolean;
  error: string | null;
  successMessage: string | null;
  providers: Provider[];
}

const initialState: ProvidersState = {
  loading: false,
  error: null,
  successMessage: null,
  providers: [],
};

export const providerReducer = (
  state = initialState,
  action: any
): ProvidersState => {
  switch (action.type) {
    case "PROVIDER_LOADING":
      return { ...state, loading: true, error: null, successMessage: null };

    case "PROVIDER_SUCCESS":
      return { ...state, loading: false, successMessage: action.payload };

    case "PROVIDER_ERROR":
      return { ...state, loading: false, error: action.payload };

    case appTypes.providers.FETCH_PROVIDERS_SUCCESS:
      return { ...state, providers: action.payload };

    case appTypes.providers.CREATE_PROVIDER_SUCCESS:
      return { ...state, providers: [...state.providers, action.payload] };

    default:
      return state;
  }
};
