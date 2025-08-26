import React from "react";

interface Props {
  onClick: () => void;
}

const ChatButton: React.FC<Props> = ({ onClick }) => {
  return (
    <button
      onClick={onClick}
      className="fixed bottom-5 right-5 bg-blue-600 hover:bg-blue-700 text-white rounded-full w-16 h-16 shadow-lg flex items-center justify-center"
    >
      💬
    </button>
  );
};

export default ChatButton;
