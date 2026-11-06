import { useCallback, useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";

import type { RootState } from "../redux/store";
import { api } from "../utils/api";
import {
  ADMIN_TABLE_CARD,
  ADMIN_TABLE_HEAD_CELL,
  ADMIN_TABLE_HEAD_ROW,
  ADMIN_TABLE_SCROLL,
} from "../utils/adminTableLayout";

type AccountStatus = "PENDING" | "APPROVED" | "REJECTED";

interface AccountRecord {
  id: string;
  email: string;
  role: "ADMIN" | "OPERATOR";
  firstName: string | null;
  lastName: string | null;
  createdAt: string | null;
  status: AccountStatus;
}

const STATUS_LABEL: Record<AccountStatus, string> = {
  PENDING: "Pending approval",
  APPROVED: "Approved",
  REJECTED: "Deactivated",
};

const STATUS_STYLE: Record<AccountStatus, string> = {
  PENDING: "bg-amber-50 text-amber-700 border-amber-200",
  APPROVED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  REJECTED: "bg-slate-100 text-slate-600 border-slate-200",
};

const STATUS_ORDER: Record<AccountStatus, number> = {
  PENDING: 0,
  APPROVED: 1,
  REJECTED: 2,
};

const actionBtnClass =
  "rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40";

export default function AdminAccountsTable() {
  const currentUserId = useSelector((state: RootState) => state.authState.user?.id);
  const [accounts, setAccounts] = useState<AccountRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setAccounts(await api.get<AccountRecord[]>("/user/accounts"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load accounts.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const sorted = useMemo(
    () =>
      [...accounts].sort(
        (a, b) =>
          STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
          a.email.localeCompare(b.email),
      ),
    [accounts],
  );

  const decide = async (account: AccountRecord, action: "approve" | "reject") => {
    if (
      action === "reject" &&
      !window.confirm(`Deactivate ${account.email}? Their sessions will be revoked.`)
    ) {
      return;
    }
    setBusyId(account.id);
    setError(null);
    try {
      const res = await api.post<{ status: AccountStatus }>(
        `/user/${encodeURIComponent(account.id)}/${action}`,
        {},
      );
      setAccounts((prev) =>
        prev.map((a) => (a.id === account.id ? { ...a, status: res.status } : a)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update account.");
    } finally {
      setBusyId(null);
    }
  };

  const pendingCount = accounts.filter((a) => a.status === "PENDING").length;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex shrink-0 items-center justify-between gap-3 px-1">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Accounts</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            New sign-ups cannot sign in until an administrator approves them.
            {pendingCount > 0 && ` ${pendingCount} awaiting approval.`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          Refresh
        </button>
      </div>

      {error && <p className="px-1 text-sm text-red-600">{error}</p>}

      <div className={ADMIN_TABLE_SCROLL}>
        <div className={ADMIN_TABLE_CARD}>
          <table className="min-w-full text-sm">
            <thead>
              <tr className={ADMIN_TABLE_HEAD_ROW}>
                <th className={`${ADMIN_TABLE_HEAD_CELL} text-left`}>Name</th>
                <th className={`${ADMIN_TABLE_HEAD_CELL} text-left`}>Email</th>
                <th className={`${ADMIN_TABLE_HEAD_CELL} text-left`}>Role</th>
                <th className={`${ADMIN_TABLE_HEAD_CELL} text-left`}>Status</th>
                <th className={`${ADMIN_TABLE_HEAD_CELL} text-left`}>Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                    Loading accounts...
                  </td>
                </tr>
              ) : sorted.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                    No accounts found.
                  </td>
                </tr>
              ) : (
                sorted.map((account) => {
                  const isSelf = account.id === currentUserId;
                  const busy = busyId === account.id;
                  return (
                    <tr key={account.id} className="text-slate-700">
                      <td className="px-4 py-3 font-medium text-slate-800">
                        {[account.firstName, account.lastName].filter(Boolean).join(" ") || "—"}
                      </td>
                      <td className="px-4 py-3">{account.email}</td>
                      <td className="px-4 py-3">{account.role}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[account.status]}`}
                        >
                          {STATUS_LABEL[account.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          {account.status !== "APPROVED" && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void decide(account, "approve")}
                              className={`${actionBtnClass} bg-emerald-600 text-white hover:bg-emerald-700`}
                            >
                              Approve
                            </button>
                          )}
                          {account.status !== "REJECTED" && !isSelf && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void decide(account, "reject")}
                              className={`${actionBtnClass} border border-red-200 bg-white text-red-700 hover:bg-red-50`}
                            >
                              {account.status === "PENDING" ? "Reject" : "Deactivate"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
