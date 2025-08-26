import { configureStore } from "@reduxjs/toolkit";
import storage from "redux-persist/lib/storage";
import { rootReducer } from "./reducers";
import type { ThunkAction } from "redux-thunk";
import type { Action } from "redux";
import { persistReducer, persistStore } from "redux-persist";

// Configuration for redux-persist
const persistConfig = {
  key: "root",
  storage,
  whitelist: ["auth"], // Only persist auth slice
};

// Wrap rootReducer with persistReducer
const persistedReducer = persistReducer(persistConfig, rootReducer);

const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false, // disables serialization warnings
      immutableCheck: false, // disables immutability checks
    }),
});

export const persistor = persistStore(store);

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
export type AppThunk<ReturnType = void> = ThunkAction<
  ReturnType,
  RootState,
  unknown,
  Action<string>
>;

export default store;
