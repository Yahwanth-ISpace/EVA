import React, { useState, useRef, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import type { RootState, AppDispatch } from "../redux/store";
import {
  sendChat,
  getChatHistory,
  clearChatHistory,
  addMessage,
  removeTyping,
} from "../redux/actions/chatsActions";
import type { ChatMessage } from "../redux/types/chatsTypes";

import MessageBubble from "./MessageBubble";
import Icon from "./Icons";

interface Props {
  payerId: string;
  userId: string;
  onClose: () => void;
}

const ChatWindow: React.FC<Props> = ({ payerId, userId, onClose }) => {
  const dispatch = useDispatch<AppDispatch>();
  const { user } = useSelector((state: RootState) => state.authState);
  const { messages, loading } = useSelector(
    (state: RootState) => state.chatsState
  );

  const [input, setInput] = useState("");
  const [streamingMsg, setStreamingMsg] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // Load chat history once
  useEffect(() => {
    dispatch(getChatHistory(userId, user?.firstName ?? ""));
  }, [dispatch, userId]);

  const handleSend = () => {
    if (!input.trim()) return;

    dispatch(addMessage({ user: "me", text: input }));
    dispatch(addMessage({ user: "bot", text: "", isTyping: true }));

    dispatch(
      sendChat({
        payerId,
        user_Id: userId,
        question: input,
        top_k: 3,
        min_score: 0.2,
      })
    ).then((res: any) => {
      dispatch(removeTyping());
      if (res?.payload?.answer) streamResponse(res.payload.answer);
    });

    setInput("");
  };

  const streamResponse = (fullText: string) => {
    setStreamingMsg("");
    let i = 0;
    const interval = setInterval(() => {
      setStreamingMsg((prev) => (prev ?? "") + fullText[i]);
      i++;
      if (i >= fullText.length) {
        clearInterval(interval);
        setStreamingMsg(null);
      }
    }, 30);
  };

  const handleClearHistory = () => {
    dispatch(clearChatHistory(userId));
  };

  // Auto scroll
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingMsg, loading]);

  // Extract threads: Only first question of each conversation
  const threads = messages.filter((m) => m.user === "me");

  const displayedMessages: ChatMessage[] = streamingMsg
    ? messages.slice(0, -1)
    : messages;

  const ThreadName =
    threads.find((msg) => msg.user === "me")?.text ?? "Untitled";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="flex flex-col w-full h-full bg-white rounded shadow-lg">
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-3 border-b bg-gray-50">
          <h2 className="text-xl font-semibold text-blue-700">CovrAi</h2>
          <div className="flex space-x-4 items-center">
            <button
              onClick={handleClearHistory}
              className="text-red-600 hover:text-red-800 text-sm"
            >
              Clear Chat
            </button>
            <Icon
              iconName="close"
              iconColor="gray-400"
              size="xs"
              onClick={onClose}
            />
          </div>
        </div>

        <div className="grid grid-cols-12 h-full">
          {/* Side Bar */}
          <div className="col-span-2 border-r bg-[#fafafa] p-4 overflow-y-auto">
            <h3 className="font-normal text-[gray] mb-2">Chats</h3>
            <ul className="space-y-2">
              <li className="flex justify-between items-center py-2 px-3 bg-[#eaeaea] rounded-lg">
                <span className="truncate max-w-[85%] font-normal text-black opacity-80">
                  {ThreadName}
                </span>
                <div className="ml-2 text-black hover:text-red-600">
                  <Icon iconName="delete" size="xs" iconColor={""} />
                </div>
              </li>
            </ul>
          </div>

          {/* Chat Display */}
          <div className="col-span-10 flex flex-col h-full">
            <div className="flex-1 flex flex-col p-6 space-y-3 overflow-y-auto max-h-[600px]">
              {displayedMessages.map((msg, i) => (
                <MessageBubble
                  key={i}
                  sender={msg.user}
                  text={msg.text}
                  isTyping={msg.isTyping}
                />
              ))}
              {streamingMsg && (
                <MessageBubble sender="bot" text={streamingMsg} />
              )}
              <div ref={endRef} />
            </div>

            {/* Input */}
            <div className="flex p-4 border-t bg-gray-50 shrink-0">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                className="flex-1 border rounded px-4 py-2 mr-3 outline-none text-black focus:ring-2 focus:ring-blue-500"
                placeholder="Ask anything..."
              />
              <button
                onClick={handleSend}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatWindow;
