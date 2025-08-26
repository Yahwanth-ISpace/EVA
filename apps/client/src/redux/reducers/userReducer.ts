import { User } from "../types/authTypes";
import {
  GET_USERS,
  GET_AGENTS,
  USERS_LOADING,
  USERS_SUCCESS,
  GET_CUSTOMERS,
} from "../types/userTypes";

interface State {
  users: User[];
  agents: User[];
  customers: User[];
  loading: boolean;
  success: string | null;
  error: string | null;
}

const initialState: State = {
  users: [],
  agents: [],
  customers: [],
  loading: false,
  success: null,
  error: null,
};

export const userReducer = (state = initialState, action: any): State => {
  switch (action.type) {
    case USERS_LOADING:
      return { ...state, loading: true, success: null, error: null };

    case USERS_SUCCESS:
      return { ...state, loading: false, success: action.payload };

    case GET_USERS:
      return {
        ...state,
        users: action.payload,
        loading: false,
        error: null,
        success: null,
      };

    case GET_AGENTS:
      return {
        ...state,
        agents: action.payload.filter((user: User) => user.role === "agent"),
        loading: false,
        error: null,
        success: null,
      };

    case GET_CUSTOMERS:
      return {
        ...state,
        customers: action.payload.filter(
          (user: User) => user.role === "customer"
        ),
        loading: false,
        error: null,
        success: null,
      };

    default:
      return state;
  }
};
