/** Shared scroll + sticky header layout for dashboard admin tables (appointments & verifications). */

export const ADMIN_TABLE_SCROLL =
  "content-wrapper flex-1 min-h-0 overflow-auto pr-1 custom-scrollbar";

export const ADMIN_TABLE_CARD =
  "rounded-xl border border-slate-200 bg-white shadow-[0_1px_3px_0_rgba(0,0,0,0.06)]";

export const ADMIN_TABLE_HEAD_ROW =
  "text-xs font-semibold uppercase tracking-wide text-slate-500";

/** Sticks to top of {@link ADMIN_TABLE_SCROLL} while vertical scrolling. */
export const ADMIN_TABLE_HEAD_CELL =
  "sticky top-0 z-10 bg-slate-50 px-4 py-3 shadow-[inset_0_-1px_0_0_rgb(226,232,240)]";
