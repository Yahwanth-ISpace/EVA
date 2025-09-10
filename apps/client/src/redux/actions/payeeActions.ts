import type { Dispatch } from "redux";
import { api } from "../../utils/api";
import payeeTypes from "../types/payeeTypes";
import type { Payee, CreatePayeeDto } from "../types/payeeTypes";

const withLoading = async <T>(
  dispatch: Dispatch,
  asyncFn: () => Promise<T>,
  successType: string,
  successMessage: string,
  failureType?: string
) => {
  dispatch({ type: payeeTypes.PAYEE_LOADING });
  try {
    const result = await asyncFn();
    dispatch({ type: successType, payload: result });
    dispatch({ type: payeeTypes.PAYEE_SUCCESS, payload: successMessage });
  } catch (err: any) {
    dispatch({
      type: failureType || payeeTypes.PAYEE_ERROR,
      payload: err.message,
    });
  }
};

// Fetch all payees
export const getAllPayees = () => async (dispatch: Dispatch) =>
  withLoading<Payee[]>(
    dispatch,
    () => api.get("/payees").then((res: any) => res.data),
    payeeTypes.FETCH_PAYEES_SUCCESS,
    "Payees fetched",
    payeeTypes.FETCH_PAYEES_FAILURE
  );

// Fetch a payee by ID
export const getPayeeById = (id: string) => async (dispatch: any) =>
  withLoading<Payee>(
    dispatch,
    () =>
      api.get(`/payees/${id}`).then((res: any) => {
        console.log(res);
        return res as Payee;
      }),
    payeeTypes.FETCH_PAYEE_SUCCESS,
    "Payee fetched",
    payeeTypes.FETCH_PAYEE_FAILURE
  );

// Create a new payee
export const createPayee =
  (payload: CreatePayeeDto) => async (dispatch: Dispatch) =>
    withLoading<Payee>(
      dispatch,
      () => api.post("/payees", payload).then((res: any) => res.data),
      payeeTypes.CREATE_PAYEE_SUCCESS,
      "Payee created",
      payeeTypes.CREATE_PAYEE_FAILURE
    );

// Update existing payee
export const updatePayee =
  (id: string, payload: Partial<CreatePayeeDto>) =>
  async (dispatch: Dispatch) =>
    withLoading<Payee>(
      dispatch,
      () => api.put(`/payees/${id}`, payload).then((res: any) => res.data),
      payeeTypes.UPDATE_PAYEE_SUCCESS,
      "Payee updated",
      payeeTypes.UPDATE_PAYEE_FAILURE
    );
