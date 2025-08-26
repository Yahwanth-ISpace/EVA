import { api } from "../../utils/api";
import appTypes from "../types";
import type { Provider } from "../types/providerTypes";

// action creators
export const getProviders = () => async (dispatch: any) => {
  dispatch({ type: appTypes.providers.FETCH_PROVIDERS_REQUEST });
  try {
    const data = await api.get<Provider[]>("/providers");
    dispatch({
      type: appTypes.providers.FETCH_PROVIDERS_SUCCESS,
      payload: data,
    });
  } catch (error: any) {
    dispatch({
      type: appTypes.providers.FETCH_PROVIDERS_FAILURE,
      payload: error.message,
    });
  }
};
