import type { Office } from "./officeTypes";

// Action Types
export const CREATE_PROVIDER_REQUEST = "CREATE_PROVIDER_REQUEST";
export const CREATE_PROVIDER_SUCCESS = "CREATE_PROVIDER_SUCCESS";
export const CREATE_PROVIDER_FAILURE = "CREATE_PROVIDER_FAILURE";

export const FETCH_PROVIDERS_REQUEST = "FETCH_PROVIDERS_REQUEST";
export const FETCH_PROVIDERS_SUCCESS = "FETCH_PROVIDERS_SUCCESS";
export const FETCH_PROVIDERS_FAILURE = "FETCH_PROVIDERS_FAILURE";

export interface Provider {
  id: string;
  name: string;
  specialty: string;
  firstName: string;
  lastName: string;
  network?: string;
  npi?: string;
  phone: string;
  email: string;
  createdAt: string;
  updatedAt: string;
  offices?: Office[]; // optional, in case you want to include office list
}
