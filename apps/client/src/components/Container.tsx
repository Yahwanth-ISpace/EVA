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
      className={`bg-white rounded-2xl shadow-sm border border-slate-100 w-full px-4 sm:px-6 py-5 min-h-[550px] max-h-[calc(100vh-12rem)] flex flex-col overflow-hidden ${className}`}
    >
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}
