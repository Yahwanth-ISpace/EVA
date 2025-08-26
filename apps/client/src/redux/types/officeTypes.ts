import type { Provider } from "./providerTypes";

// Action Types
export const CREATE_OFFICE_REQUEST = "CREATE_OFFICE_REQUEST";
export const CREATE_OFFICE_SUCCESS = "CREATE_OFFICE_SUCCESS";
export const CREATE_OFFICE_FAILURE = "CREATE_OFFICE_FAILURE";

export const FETCH_OFFICES_REQUEST = "FETCH_OFFICES_REQUEST";
export const FETCH_OFFICES_SUCCESS = "FETCH_OFFICES_SUCCESS";
export const FETCH_OFFICES_FAILURE = "FETCH_OFFICES_FAILURE";

export interface Office {
  id: string;
  providerId: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  createdAt: string;
  updatedAt: string;
  provider: Provider;
}
