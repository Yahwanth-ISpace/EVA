import { api } from "../../utils/api";
import appTypes from "../types";
import type { Office } from "../types/officeTypes";

// action creators
export const getOffices = (providerId: string) => async (dispatch: any) => {
  dispatch({ type: appTypes.offices.FETCH_OFFICES_REQUEST });
  try {
    const offices = await api.get<Office[]>(
      `/offices?providerId=${providerId}`
    );
    dispatch({
      type: appTypes.offices.FETCH_OFFICES_SUCCESS,
      payload: offices,
    });
  } catch (error: any) {
    dispatch({
      type: appTypes.offices.FETCH_OFFICES_FAILURE,
      payload: error.message,
    });
  }
};
