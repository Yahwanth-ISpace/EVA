import type { Dispatch } from "redux";
import { chatApi } from "../../utils/chatApi";
import chatTypes, {
  type ChatMessage,
  type ChatResponse,
} from "../types/chatsTypes";

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

// convenience actions used by the component
export const addMessage = (msg: ChatMessage) => ({
  type: chatTypes.CHAT_ADD_MESSAGE,
  payload: msg,
});

export const removeTyping = () => ({
  type: chatTypes.CHAT_REMOVE_TYPING,
});

// Send chat message
export const sendChat =
  (payload: {
    payerId: string;
    user_Id: string;
    question: string;
    top_k: number;
    min_score: number;
  }) =>
  async (dispatch: Dispatch) =>
    withLoading(
      dispatch,
      () => chatApi.post("/chat", payload).then((res: any) => res),
      chatTypes.SEND_CHAT_SUCCESS,
      "Message sent",
      chatTypes.SEND_CHAT_FAILURE
    );

// Get chat history
// Get chat history
export const getChatHistory =
  (userId: string, firstName: string) => async (dispatch: Dispatch) => {
    dispatch({ type: chatTypes.CHAT_LOADING });
    try {
      const res = (await chatApi.get(`/chat/history/${userId}`)) as {
        history: any;
      };

      dispatch({
        type: chatTypes.FETCH_HISTORY_SUCCESS,
        payload: res.history,
        firstName, // pass it directly
      });

      dispatch({
        type: chatTypes.CHAT_SUCCESS,
        payload: "Chat history fetched",
      });
    } catch (err: any) {
      dispatch({
        type: chatTypes.FETCH_HISTORY_FAILURE,
        payload: err.message,
      });
    }
  };

// Clear chat history
export const clearChatHistory =
  (userId: string) => async (dispatch: Dispatch) =>
    withLoading(
      dispatch,
      () =>
        chatApi.post(`/chat/clear/${userId}`, {}).then((res: any) => res.data),
      chatTypes.CLEAR_HISTORY_SUCCESS,
      "Chat cleared",
      chatTypes.CLEAR_HISTORY_FAILURE
    );
