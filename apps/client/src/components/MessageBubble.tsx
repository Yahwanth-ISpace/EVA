import React, { type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import { useSelector } from "react-redux";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneLight } from "react-syntax-highlighter/dist/cjs/styles/prism";
import remarkGfm from "remark-gfm";
import type { RootState } from "../redux/store";
import TypingAnimation from "./TypingAnimation";

interface MessageBubbleProps {
  sender: "me" | "bot";
  text?: string;
  isTyping?: boolean;
}

interface CodeRendererProps extends React.HTMLAttributes<HTMLElement> {
  inline?: boolean;
  className?: string;
  children?: ReactNode;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({
  sender,
  text,
  isTyping,
}) => {
  const { user } = useSelector((state: RootState) => state.authState);
  const isUser = sender === "me";

  const renderBotText = (raw?: string) => {
    if (!raw) return null;
    const clean = raw.replace(/\s+([.,!?;:])/g, "$1");

    return (
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children, ...props }) => (
            <p className="mb-2 last:mb-0 whitespace-pre-wrap" {...props}>
              {children}
            </p>
          ),
          h1: ({ children, ...props }) => (
            <h1 className="text-2xl font-bold my-2" {...props}>
              {children}
            </h1>
          ),
          h2: ({ children, ...props }) => (
            <h2 className="text-xl font-semibold my-2" {...props}>
              {children}
            </h2>
          ),
          h3: ({ children, ...props }) => (
            <h3 className="text-lg font-semibold my-1" {...props}>
              {children}
            </h3>
          ),
          strong: ({ children, ...props }) => (
            <strong className="font-semibold text-gray-900" {...props}>
              {children}
            </strong>
          ),
          em: ({ children, ...props }) => (
            <em className="italic text-gray-700" {...props}>
              {children}
            </em>
          ),
          a: ({ href, children, ...props }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 underline"
              {...props}
            >
              {children}
            </a>
          ),
          code: ({
            inline,
            className,
            children,
            ...props
          }: CodeRendererProps) => {
            const codeContent = Array.isArray(children)
              ? children.map((c) => (typeof c === "string" ? c : "")).join("")
              : String(children);

            const match = /language-(\w+)/.exec(className || "");

            if (!inline) {
              return (
                <div className="relative">
                  {match ? (
                    <SyntaxHighlighter
                      style={oneLight}
                      language={match[1]}
                      PreTag="div"
                      className="rounded-md my-2"
                    >
                      {codeContent}
                    </SyntaxHighlighter>
                  ) : (
                    <pre className="bg-gray-900 text-gray-100 rounded p-3 overflow-x-auto font-mono text-sm my-2">
                      <code>{codeContent}</code>
                    </pre>
                  )}
                  {/* Copy button for code */}
                  <button
                    className="absolute top-2 right-2 text-gray-400 hover:text-gray-600 text-xs"
                    onClick={() => navigator.clipboard.writeText(codeContent)}
                  >
                    Copy
                  </button>
                </div>
              );
            }

            // Inline code
            return (
              <code
                className="bg-gray-100 rounded px-1 py-0.5 font-mono text-sm"
                {...props}
              >
                {codeContent}
              </code>
            );
          },
          blockquote: ({ children, ...props }) => (
            <blockquote
              className="border-l-4 border-gray-300 bg-gray-50 pl-4 italic text-gray-700 my-4 py-2 rounded"
              {...props}
            >
              {children}
            </blockquote>
          ),
          ul: ({ children, ...props }) => (
            <ul className="list-disc pl-5 space-y-1 text-gray-700" {...props}>
              {children}
            </ul>
          ),
          ol: ({ children, ...props }) => (
            <ol
              className="list-decimal pl-5 space-y-1 text-gray-700"
              {...props}
            >
              {children}
            </ol>
          ),
          li: ({ children, ...props }) => (
            <li className="leading-relaxed" {...props}>
              {children}
            </li>
          ),
          table: ({ children, ...props }) => (
            <table
              className="border border-gray-300 rounded-md border-collapse my-2 w-full"
              {...props}
            >
              {children}
            </table>
          ),
          th: ({ children, ...props }) => (
            <th
              className="border border-gray-300 bg-gray-200 px-3 py-1 text-left"
              {...props}
            >
              {children}
            </th>
          ),
          td: ({ children, ...props }) => (
            <td className="border border-gray-300 px-3 py-1" {...props}>
              {children}
            </td>
          ),
        }}
        skipHtml={false}
      >
        {clean}
      </ReactMarkdown>
    );
  };

  return (
    <div
      className={`flex items-end space-x-2 ${
        isUser ? "justify-end" : "justify-start"
      }`}
    >
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold">
          AI
        </div>
      )}

      <div
        className={`relative p-3 rounded-2xl shadow-md ${
          isUser
            ? "bg-blue-600 text-white rounded-br-none max-w-[60%]"
            : "bg-white border border-gray-200 text-gray-800 rounded-bl-none w-fit max-w-[80%] md:max-w-[70%] lg:max-w-[80%]"
        }`}
      >
        {isTyping ? (
          <TypingAnimation />
        ) : isUser ? (
          <div className="text-md font-sans whitespace-pre-wrap">{text}</div>
        ) : (
          <div className="text-sm relative leading-relaxed pr-4">
            {renderBotText(text)}
          </div>
        )}
      </div>

      {isUser && (
        <div className="w-8 h-8 rounded-full bg-gray-400 flex items-center justify-center text-white font-semibold">
          {user?.firstName ? user.firstName[0] : ""}
        </div>
      )}
    </div>
  );
};

export default MessageBubble;
