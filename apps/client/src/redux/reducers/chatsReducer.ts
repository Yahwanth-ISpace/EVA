import chatTypes from "../types/chatsTypes";
import type { ChatMessage } from "../types/chatsTypes";

interface ChatState {
  loading: boolean;
  error: string | null;
  successMessage: string | null;
  messages: ChatMessage[];
}

const initialState: ChatState = {
  loading: false,
  error: null,
  successMessage: null,
  messages: [],
};

export const chatsReducer = (state = initialState, action: any): ChatState => {
  switch (action.type) {
    case chatTypes.CHAT_LOADING:
      return { ...state, loading: true, error: null, successMessage: null };

    case chatTypes.CHAT_SUCCESS:
      return { ...state, loading: false, successMessage: action.payload };

    case chatTypes.CHAT_ERROR:
      return { ...state, loading: false, error: action.payload };

    case chatTypes.SEND_CHAT_SUCCESS:
      return {
        ...state,
        messages: [
          ...state.messages,
          { user: "bot", text: action.payload.answer },
        ],
      };

    case chatTypes.FETCH_HISTORY_SUCCESS:
      return { ...state, messages: action.payload }; // array of ChatMessage

    case chatTypes.CLEAR_HISTORY_SUCCESS:
      return { ...state, messages: [] };

    default:
      return state;
  }
};
