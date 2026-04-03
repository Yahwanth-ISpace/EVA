import { forwardRef, useMemo } from "react";
import {
  formatCallLogLine,
  formatLiveLogTimestamp,
  parseLiveLogMessage,
  parseTranscriptIntoTurns,
  type BotTrackerRecord,
  type LiveLogMessageRole,
  type TranscriptTurn,
} from "../utils/botTracker";

export type CallFooterPhase = "barge" | "end";

export interface CallActivitySectionProps {
  callLogTab: "live" | "transcript";
  setCallLogTab: (t: "live" | "transcript") => void;
  isCallInProgress: boolean;
  liveChronological: BotTrackerRecord[];
  hasTranscript: boolean;
  transcriptText: string;
  onLiveScroll: () => void;
  callFooterPhase: CallFooterPhase;
  onBargeInClick: () => void;
  onEndCallClick: () => void;
  endCallLoading?: boolean;
  canEndCall: boolean;
}

function CallChatColumnHeader() {
  return (
    <div className="flex justify-between gap-2 px-1 pb-1 border-b border-slate-200/80 mb-1">
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
        TPA
      </span>
      <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">
        EVA
      </span>
    </div>
  );
}

function CallChatBubble({
  id,
  role,
  text,
  timeLabel,
  dateTimeAttr,
}: {
  id: string;
  role: LiveLogMessageRole;
  text: string;
  timeLabel?: string;
  dateTimeAttr?: string;
}) {
  if (role === "system") {
    return (
      <div className="flex justify-center px-1" data-msg-id={id}>
        <div className="max-w-[95%] flex flex-col items-center gap-1">
          <p className="text-[11px] text-slate-600 bg-white/90 border border-slate-200/80 rounded-full px-3 py-1.5 font-mono leading-snug text-center whitespace-pre-wrap break-words">
            {text}
          </p>
          {timeLabel ? (
            <time
              dateTime={dateTimeAttr}
              className="text-[10px] text-slate-400 tabular-nums"
            >
              {timeLabel}
            </time>
          ) : null}
        </div>
      </div>
    );
  }
  const isEva = role === "eva";
  return (
    <div
      className={`flex w-full ${isEva ? "justify-end" : "justify-start"}`}
      data-msg-id={id}
    >
      <div
        className={`max-w-[min(88%,20rem)] flex flex-col gap-0.5 ${isEva ? "items-end" : "items-start"}`}
      >
        <div
          className={`rounded-2xl px-3 py-2 text-sm leading-relaxed shadow-sm whitespace-pre-wrap break-words ${
            isEva
              ? "bg-indigo-600 text-white rounded-br-md"
              : "bg-white text-slate-800 border border-slate-200/90 rounded-bl-md"
          }`}
        >
          {text || "—"}
        </div>
        {timeLabel ? (
          <time
            dateTime={dateTimeAttr}
            className={`text-[10px] text-slate-400 tabular-nums px-0.5 ${isEva ? "text-right" : "text-left"}`}
          >
            {timeLabel}
          </time>
        ) : null}
      </div>
    </div>
  );
}

/** Saved transcript as plain log lines: EVA (indigo), TPA (default), divider after each turn. */
function TranscriptLogView({ fullText }: { fullText: string }) {
  const turns = useMemo(
    () => parseTranscriptIntoTurns(fullText),
    [fullText],
  );

  if (turns.length === 0) {
    return (
      <p className="text-sm text-slate-500 italic px-1 font-mono">No content.</p>
    );
  }

  return (
    <>
      {turns.map((turn, i) => (
        <TranscriptLogEntry
          key={`t-${i}`}
          turn={turn}
          showDividerBelow={i < turns.length - 1}
        />
      ))}
    </>
  );
}

function TranscriptLogEntry({
  turn,
  showDividerBelow,
}: {
  turn: TranscriptTurn;
  showDividerBelow: boolean;
}) {
  if (turn.kind === "divider") {
    return (
      <div className="py-2">
        <div
          className="flex items-center gap-2"
          role="separator"
          aria-label="Section break"
        >
          <div className="flex-1 border-t border-dashed border-slate-300" />
          <span className="text-[10px] text-slate-400 font-mono shrink-0">
            —
          </span>
          <div className="flex-1 border-t border-dashed border-slate-300" />
        </div>
        {showDividerBelow ? (
          <div className="mt-2 border-b border-slate-200" aria-hidden />
        ) : null}
      </div>
    );
  }

  if (turn.role === "system") {
    return (
      <div>
        <p className="font-mono text-[13px] leading-relaxed text-slate-600 whitespace-pre-wrap break-words pl-0.5">
          {turn.text}
        </p>
        {showDividerBelow ? (
          <div
            className="mt-3 mb-1 border-b border-slate-200"
            aria-hidden
          />
        ) : null}
      </div>
    );
  }

  const isEva = turn.role === "eva";
  const label = isEva ? "EVA" : "TPA";

  return (
    <div>
      <p className="font-mono text-[13px] leading-relaxed whitespace-pre-wrap break-words">
        <span
          className={
            isEva
              ? "font-semibold text-indigo-600"
              : "font-semibold text-slate-800"
          }
        >
          {label}:
        </span>
        {isEva ? (
          <span className="text-indigo-600">
            {turn.text ? ` ${turn.text}` : " —"}
          </span>
        ) : (
          <span className="text-slate-700">
            {turn.text ? ` ${turn.text}` : " —"}
          </span>
        )}
      </p>
      {showDividerBelow ? (
        <div className="mt-3 mb-1 border-b border-slate-200" aria-hidden />
      ) : null}
    </div>
  );
}

export const CallActivitySection = forwardRef<
  HTMLDivElement,
  CallActivitySectionProps
>(function CallActivitySection(
  {
    callLogTab,
    setCallLogTab,
    isCallInProgress,
    liveChronological,
    hasTranscript,
    transcriptText,
    onLiveScroll,
    callFooterPhase,
    onBargeInClick,
    onEndCallClick,
    endCallLoading = false,
    canEndCall,
  },
  ref,
) {
  return (
    <section className="flex flex-col flex-1 min-h-0 p-4 sm:p-5 border-0 bg-slate-50/40">
      <div className="flex items-center gap-2 mb-4 shrink-0">
        <span className="flex h-8 w-1 rounded-full bg-indigo-600 shrink-0" />
        <div>
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
            Call activity
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Live lines during the call; transcript as a log after it ends.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200/90 bg-white overflow-hidden shadow-sm flex flex-col flex-1 min-h-0">
        <div
          className="flex flex-wrap items-stretch justify-start gap-0 border-b border-slate-200 bg-white px-2 pt-1 shrink-0"
          role="tablist"
          aria-label="Call activity"
        >
          <button
            type="button"
            role="tab"
            aria-selected={callLogTab === "live"}
            id="tab-live"
            aria-controls="panel-live"
            title={
              isCallInProgress
                ? "Call in progress — live stream active"
                : "No active call — idle"
            }
            onClick={() => setCallLogTab("live")}
            className={`relative px-4 py-3 text-sm font-semibold transition-colors rounded-t-lg ${
              callLogTab === "live"
                ? isCallInProgress
                  ? "text-red-600"
                  : "text-emerald-600"
                : isCallInProgress
                  ? "text-red-600/90 hover:text-red-700"
                  : "text-slate-500 hover:text-emerald-600"
            }`}
          >
            <span className="inline-flex items-center gap-2">
              {isCallInProgress ? (
                <span
                  className="relative flex h-2.5 w-2.5 shrink-0"
                  aria-hidden
                >
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-60" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.7)]" />
                </span>
              ) : (
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500 shadow-[0_0_0_2px_rgba(16,185,129,0.35)]"
                  aria-hidden
                />
              )}
              <span>Live</span>
            </span>
            {callLogTab === "live" && (
              <span
                className={`absolute bottom-0 left-4 right-4 h-0.5 rounded-full ${
                  isCallInProgress ? "bg-red-500" : "bg-emerald-500"
                }`}
              />
            )}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={callLogTab === "transcript"}
            id="tab-transcript"
            aria-controls="panel-transcript"
            onClick={() => setCallLogTab("transcript")}
            className={`relative px-4 py-3 text-sm font-semibold transition-colors rounded-t-lg ${
              callLogTab === "transcript"
                ? "text-indigo-600"
                : "text-slate-500 hover:text-indigo-500"
            }`}
          >
            Transcript
            {callLogTab === "transcript" && (
              <span className="absolute bottom-0 left-4 right-4 h-0.5 rounded-full bg-indigo-600" />
            )}
          </button>
        </div>

        <div
          id="panel-live"
          role="tabpanel"
          aria-labelledby="tab-live"
          hidden={callLogTab !== "live"}
          className={
            callLogTab === "live" ? "flex flex-col flex-1 min-h-0" : "hidden"
          }
        >
          <div className="relative flex flex-1 min-h-0 flex-col">
            <div
              ref={ref}
              onScroll={onLiveScroll}
              className="flex-1 min-h-0 overflow-y-auto scroll-smooth custom-scrollbar bg-slate-100/50 p-3 sm:p-4"
            >
              {liveChronological.length > 0 ? (
                <div
                  className="flex flex-col gap-3 pr-0.5"
                  role="log"
                  aria-live="polite"
                >
                  <CallChatColumnHeader />
                  {liveChronological.map((log) => {
                    const raw = formatCallLogLine(log);
                    const { role, text } = parseLiveLogMessage(raw);
                    const ts = formatLiveLogTimestamp(log.createdAt);
                    return (
                      <CallChatBubble
                        key={log.id}
                        id={log.id}
                        role={role}
                        text={text}
                        timeLabel={ts || undefined}
                        dateTimeAttr={log.createdAt}
                      />
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-10 px-6 text-center min-h-[10rem]">
                  <div
                    className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400"
                    aria-hidden
                  >
                    <svg
                      className="h-5 w-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
                      />
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-slate-700">
                    No live lines yet
                  </p>
                  <p className="mt-1 max-w-xs text-xs text-slate-500 leading-relaxed">
                    When a verification call starts, conversation lines stream
                    here—newest at the bottom.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div
          id="panel-transcript"
          role="tabpanel"
          aria-labelledby="tab-transcript"
          hidden={callLogTab !== "transcript"}
          className={
            callLogTab === "transcript"
              ? "flex flex-col flex-1 min-h-0"
              : "hidden"
          }
        >
          <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar bg-slate-100/50 p-3 sm:p-4">
            {hasTranscript ? (
              <TranscriptLogView fullText={transcriptText} />
            ) : (
              <div className="flex flex-col items-center justify-center py-10 px-6 text-center min-h-[10rem]">
                <div
                  className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-violet-50 text-violet-400"
                  aria-hidden
                >
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                    />
                  </svg>
                </div>
                <p className="text-sm font-medium text-slate-800">
                  No transcript yet
                </p>
                <p className="mt-1.5 max-w-sm text-xs text-slate-500 leading-relaxed">
                  After the verification call finishes, the saved conversation
                  transcript will show here as a log. Follow the call on the{" "}
                  <span className="font-semibold text-indigo-600">Live</span>{" "}
                  tab.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-3 shrink-0 px-0.5">
        {callFooterPhase === "barge" ? (
          <button
            type="button"
            disabled={!isCallInProgress}
            onClick={onBargeInClick}
            className="w-full rounded-lg py-2.5 text-center text-sm font-semibold shadow-sm transition-colors disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none bg-indigo-600 text-white hover:bg-indigo-700"
          >
            Barge in
          </button>
        ) : (
          <button
            type="button"
            disabled={!canEndCall || endCallLoading}
            onClick={onEndCallClick}
            className="w-full rounded-lg py-2.5 text-center text-sm font-semibold shadow-sm transition-colors disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none bg-red-600 text-white hover:bg-red-700"
          >
            {endCallLoading ? "Ending…" : "End call"}
          </button>
        )}
      </div>
    </section>
  );
});
