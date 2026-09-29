import { combineReducers } from "redux";
import { authReducer } from "./authReducer";
import { verificationsReducer } from "./verificationReducer";
import { providerReducer } from "./providerReducer";
import { officesReducer } from "./officesReducer";
import { chatsReducer } from "./chatsReducer";
import { payeeReducer } from "./payeeReducer";
import { appointmentsReducer } from "./appointmentsReducer";
import { agentsReducer } from "./agentsReducer";

export const rootReducer = combineReducers({
  authState: authReducer,
  verificationsState: verificationsReducer,
  providersState: providerReducer,
  officesState: officesReducer,
  chatsState: chatsReducer,
  payeeState: payeeReducer,
  appointmentsState: appointmentsReducer,
  agentsState: agentsReducer,
});

export type AppState = ReturnType<typeof rootReducer>;
