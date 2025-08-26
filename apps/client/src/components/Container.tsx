import React from "react";

interface ContainerProps {
  children: React.ReactNode;
  className?: string;
}

export default function Container({
  children,
  className = "",
}: ContainerProps) {
  return (
    <div
      className={`bg-white rounded-xl shadow-md max-w-7xl mx-auto px-6 p-4 w-full h-[590px] flex flex-col ${className}`}
    >
      <div>{children}</div>
      
    </div>
  );
}
