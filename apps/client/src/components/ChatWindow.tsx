import React, { useState, useRef, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import type { RootState, AppDispatch } from "../redux/store";
import {
  sendChat,
  getChatHistory,
  clearChatHistory,
} from "../redux/actions/chatsActions";
import type { ChatMessage } from "../redux/types/chatsTypes";

interface Props {
  payerId: string;
  userId: string;
}

const ChatWindow: React.FC<Props> = ({ payerId, userId }) => {
  const dispatch = useDispatch<AppDispatch>();
  const { messages, loading } = useSelector(
    (state: RootState) => state.chatsState
  );
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  // Load chat history when component mounts
  useEffect(() => {
    dispatch(getChatHistory(userId));
  }, [dispatch, userId]);

  const handleSend = () => {
    if (!input.trim()) {
      return;
    }

    // Add user message locally
    // const userMessage: ChatMessage = {
    //   user: user.firstName,
    //   text: input,
    // };

    dispatch(
      sendChat({
        payerId,
        userId,
        question: input,
        top_k: 5,
        min_score: 0.3,
      })
    );

    setInput("");
  };

  const handleClearHistory = () => {
    dispatch(clearChatHistory(userId));
  };

  // Scroll to bottom when messages change
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex flex-col h-full text-black font-normal">
      {/* Header with Clear History */}
      <div className="flex justify-between items-center p-3 border-b">
        <h2 className="text-lg text-blue-700 font-semibold">CovrAi</h2>
        <button
          onClick={handleClearHistory}
          className="text-red-600 hover:text-red-800 text-sm"
        >
          Clear Chat
        </button>
      </div>

      <div className="flex-1 p-3 space-y-2 overflow-y-auto">
        {messages.map((msg: ChatMessage, i: number) => (
          <div
            key={i}
            className={`flex ${
              msg.user === "me" ? "justify-end" : "justify-start"
            }`}
          >
            <div
              className={`p-2 rounded-lg ${
                msg.user === "me"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-200 text-gray-800"
              }`}
            >
              {msg.text}
            </div>
          </div>
        ))}
        <div ref={endRef}></div>
      </div>

      <div className="p-3 border-t flex">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          className="flex-1 border rounded px-3 py-2 mr-2 outline-none"
          placeholder="Ask Anything"
        />
        <button
          onClick={handleSend}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
        >
          Send
        </button>
      </div>
    </div>
  );
};

export default ChatWindow;
