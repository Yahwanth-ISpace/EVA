// Action Types
const payeeTypes = {
  PAYEE_LOADING: "PAYEE_LOADING",
  PAYEE_SUCCESS: "PAYEE_SUCCESS",
  PAYEE_ERROR: "PAYEE_ERROR",

  FETCH_PAYEES_SUCCESS: "FETCH_PAYEES_SUCCESS",
  FETCH_PAYEES_FAILURE: "FETCH_PAYEES_FAILURE",

  FETCH_PAYEE_SUCCESS: "FETCH_PAYEE_SUCCESS",
  FETCH_PAYEE_FAILURE: "FETCH_PAYEE_FAILURE",

  CREATE_PAYEE_SUCCESS: "CREATE_PAYEE_SUCCESS",
  CREATE_PAYEE_FAILURE: "CREATE_PAYEE_FAILURE",

  UPDATE_PAYEE_SUCCESS: "UPDATE_PAYEE_SUCCESS",
  UPDATE_PAYEE_FAILURE: "UPDATE_PAYEE_FAILURE",
};

export interface CreatePayeeDto {
  name: string;
  dob?: string;
  payer?: { id: string; name: string };
}

export interface Payee {
  data: any;
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  dob: string;
  ssn: string;
  payerId: string;
}

export default payeeTypes;
