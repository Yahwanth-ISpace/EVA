import type { Dispatch } from "redux";
import { api } from "../../utils/api";
import chatTypes from "../types/chatsTypes";

const withLoading = async <T>(
  dispatch: Dispatch,
  asyncFn: () => Promise<T>,
  successType: string,
  successMessage: string,
  failureType?: string
) => {
  dispatch({ type: chatTypes.CHAT_LOADING });
  try {
    const result = await asyncFn();
    dispatch({ type: successType, payload: result });
    dispatch({ type: chatTypes.CHAT_SUCCESS, payload: successMessage });
  } catch (err: any) {
    dispatch({
      type: failureType || chatTypes.CHAT_ERROR,
      payload: err.message,
    });
  }
};

// Send chat message
export const sendChat =
  (payload: {
    payerId: string;
    userId: string;
    question: string;
    top_k: number;
    min_score: number;
  }) =>
  async (dispatch: Dispatch) =>
    withLoading(
      dispatch,
      () => api.post("/rag/chat", payload).then((res: any) => res.data),
      chatTypes.SEND_CHAT_SUCCESS,
      "Message sent",
      chatTypes.SEND_CHAT_FAILURE
    );

// Get chat history
export const getChatHistory = (userId: string) => async (dispatch: Dispatch) =>
  withLoading(
    dispatch,
    () =>
      api
        .get(`/rag/chat/history/${userId}`)
        .then((res: any) => res.data.history),
    chatTypes.FETCH_HISTORY_SUCCESS,
    "Chat history fetched",
    chatTypes.FETCH_HISTORY_FAILURE
  );

// Clear chat history
export const clearChatHistory =
  (userId: string) => async (dispatch: Dispatch) =>
    withLoading(
      dispatch,
      () =>
        api.post(`/rag/chat/clear/${userId}`, {}).then((res: any) => res.data),
      chatTypes.CLEAR_HISTORY_SUCCESS,
      "Chat cleared",
      chatTypes.CLEAR_HISTORY_FAILURE
    );
