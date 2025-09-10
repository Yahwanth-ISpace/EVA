import React from "react";

const TypingAnimation: React.FC = () => (
  <div className="flex space-x-1">
    <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"></span>
    <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce delay-150"></span>
    <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce delay-300"></span>
  </div>
);

export default TypingAnimation;
