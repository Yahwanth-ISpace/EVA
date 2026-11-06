// src/utils/handlers.ts
// src/utils/handlers.ts
import type { Dispatch } from "redux";
// import { toast } from "react-toastify"; // Optional: enable if you use it

export const handleSuccess = (
  dispatch: Dispatch,
  type: string,
  message: string
) => {
  dispatch({ type, payload: message });
};

export const handleError = (
  dispatch: Dispatch,
  type: string,
  err: unknown,
  showToast: boolean = false
) => {
  let errorMessage = "An unknown error occurred";

  if (
    typeof err === "object" &&
    err !== null &&
    "message" in err &&
    typeof (err as any).message === "string"
  ) {
    errorMessage = (err as any).message;
  }

  dispatch({ type, payload: errorMessage });

  if (showToast) {
    // toast.error(errorMessage);
    console.error("ERROR:", errorMessage); // Replace with toast if using
  }
};
