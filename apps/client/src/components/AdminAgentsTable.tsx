import { useEffect, useMemo, useState } from "react";
import Skeleton from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";
import { FaTrashAlt } from "react-icons/fa";
import { useDispatch, useSelector } from "react-redux";

import {
  createAgent,
  deleteAgent,
  getAgents,
  updateAgent,
} from "../redux/actions/agentActions";
import type { AppDispatch, RootState } from "../redux/store";
import type { AgentRecord, AgentStatus } from "../redux/types/agentTypes";
import {
  ADMIN_TABLE_CARD,
  ADMIN_TABLE_HEAD_CELL,
  ADMIN_TABLE_HEAD_ROW,
  ADMIN_TABLE_SCROLL,
} from "../utils/adminTableLayout";

const AGENT_STATUSES: AgentStatus[] = ["READY", "IN_PROGRESS", "SUSPENDED"];

const STATUS_LABEL: Record<AgentStatus, string> = {
  READY: "Ready",
  IN_PROGRESS: "In progress",
  SUSPENDED: "Suspended",
};

const emptyNewAgent = {
  name: "",
  twilioPhoneNumber: "",
  twilioPhoneNumberExt: "+1",
  status: "READY" as AgentStatus,
};

type RowDraft = {
  name: string;
  twilioPhoneNumber: string;
  twilioPhoneNumberExt: string;
  status: AgentStatus;
};

function draftFromAgent(agent: AgentRecord): RowDraft {
  return {
    name: agent.name,
    twilioPhoneNumber: agent.twilioPhoneNumber,
    twilioPhoneNumberExt: agent.twilioPhoneNumberExt,
    status: agent.status,
  };
}

function draftsEqual(a: RowDraft, b: RowDraft) {
  return (
    a.name === b.name &&
    a.twilioPhoneNumber === b.twilioPhoneNumber &&
    a.twilioPhoneNumberExt === b.twilioPhoneNumberExt &&
    a.status === b.status
  );
}

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";

const actionBtnClass =
  "rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40";

export default function AdminAgentsTable() {
  const dispatch = useDispatch<AppDispatch>();
  const { agents, loading, saving, error } = useSelector(
    (state: RootState) => state.agentsState,
  );

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newAgent, setNewAgent] = useState(emptyNewAgent);
  const [formError, setFormError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<RowDraft | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const closeCreateModal = () => {
    setCreateModalOpen(false);
    setNewAgent(emptyNewAgent);
    setFormError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft(null);
    setRowError(null);
  };

  useEffect(() => {
    dispatch(getAgents());
  }, [dispatch]);

  useEffect(() => {
    if (!createModalOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeCreateModal();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [createModalOpen]);

  const sortedAgents = useMemo(
    () => [...agents].sort((a, b) => a.name.localeCompare(b.name)),
    [agents],
  );

  const editingAgent = useMemo(
    () => sortedAgents.find((a) => a.id === editingId) ?? null,
    [sortedAgents, editingId],
  );

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!newAgent.name.trim() || !newAgent.twilioPhoneNumber.trim()) {
      setFormError("Name and phone number are required.");
      return;
    }

    try {
      await dispatch(
        createAgent({
          name: newAgent.name.trim(),
          twilioPhoneNumber: newAgent.twilioPhoneNumber.trim(),
          twilioPhoneNumberExt:
            newAgent.twilioPhoneNumberExt.trim() || "+1",
          status: newAgent.status,
        }),
      );
      closeCreateModal();
    } catch (err: unknown) {
      setFormError(
        err instanceof Error ? err.message : "Could not create agent.",
      );
    }
  };

  const startEdit = (agent: AgentRecord) => {
    setEditingId(agent.id);
    setEditDraft(draftFromAgent(agent));
    setRowError(null);
  };

  const handleSaveEdit = async (agent: AgentRecord) => {
    if (!editDraft) return;

    if (!editDraft.name.trim() || !editDraft.twilioPhoneNumber.trim()) {
      setRowError("Name and phone number are required.");
      return;
    }

    if (draftsEqual(editDraft, draftFromAgent(agent))) {
      cancelEdit();
      return;
    }

    try {
      await dispatch(
        updateAgent(agent.id, {
          name: editDraft.name.trim(),
          twilioPhoneNumber: editDraft.twilioPhoneNumber.trim(),
          twilioPhoneNumberExt: editDraft.twilioPhoneNumberExt.trim() || "+1",
          status: editDraft.status,
        }),
      );
      cancelEdit();
    } catch (err: unknown) {
      setRowError(
        err instanceof Error ? err.message : "Could not save changes.",
      );
    }
  };

  const handleDelete = async (agent: AgentRecord) => {
    if (editingId === agent.id) cancelEdit();

    const confirmed = window.confirm(
      `Delete agent "${agent.name}"? This cannot be undone.`,
    );
    if (!confirmed) return;

    try {
      await dispatch(deleteAgent(agent.id));
    } catch (err: unknown) {
      setRowError(
        err instanceof Error ? err.message : "Could not delete agent.",
      );
    }
  };

  const patchEditDraft = (patch: Partial<RowDraft>) => {
    setEditDraft((prev) => (prev ? { ...prev, ...patch } : prev));
    setRowError(null);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex shrink-0 items-center justify-between gap-3 px-1">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Agents</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Manage Twilio agents used by the verification scheduler.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateModalOpen(true)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
        >
          Create agent
        </button>
      </div>

      {error && !createModalOpen && !editingId && (
        <p className="px-1 text-sm text-red-600">{error}</p>
      )}

      {createModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="presentation"
        >
          <button
            type="button"
            aria-label="Close dialog"
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px]"
            onClick={closeCreateModal}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-agent-title"
            className="relative z-10 w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3
                  id="create-agent-title"
                  className="text-lg font-semibold text-slate-900"
                >
                  Create agent
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Agents with status Ready can be assigned to outbound calls.
                </p>
              </div>
              <button
                type="button"
                onClick={closeCreateModal}
                className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                aria-label="Close"
              >
                <span className="text-xl leading-none">&times;</span>
              </button>
            </div>

            <form onSubmit={handleCreate} className="mt-5 space-y-4">
              <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-600">
                Name
                <input
                  className={inputClass}
                  value={newAgent.name}
                  onChange={(e) =>
                    setNewAgent((prev) => ({ ...prev, name: e.target.value }))
                  }
                  placeholder="Insurance Verification Agent1"
                  autoFocus
                />
              </label>

              <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-600">
                Extension
                <input
                  className={inputClass}
                  value={newAgent.twilioPhoneNumberExt}
                  onChange={(e) =>
                    setNewAgent((prev) => ({
                      ...prev,
                      twilioPhoneNumberExt: e.target.value,
                    }))
                  }
                  placeholder="+1"
                />
              </label>

              <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-600">
                Phone number
                <input
                  className={inputClass}
                  value={newAgent.twilioPhoneNumber}
                  onChange={(e) =>
                    setNewAgent((prev) => ({
                      ...prev,
                      twilioPhoneNumber: e.target.value,
                    }))
                  }
                  placeholder="+15551234567"
                />
              </label>

              <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-600">
                Status
                <select
                  className={inputClass}
                  value={newAgent.status}
                  onChange={(e) =>
                    setNewAgent((prev) => ({
                      ...prev,
                      status: e.target.value as AgentStatus,
                    }))
                  }
                >
                  {AGENT_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {STATUS_LABEL[status]}
                    </option>
                  ))}
                </select>
              </label>

              {formError && (
                <p className="text-sm text-red-600">{formError}</p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeCreateModal}
                  disabled={saving}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? "Creating…" : "Create agent"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className={`${ADMIN_TABLE_CARD} flex min-h-0 flex-1 flex-col`}>
        <div className={ADMIN_TABLE_SCROLL}>
          <table className="min-w-full border-collapse text-left">
            <thead>
              <tr className={ADMIN_TABLE_HEAD_ROW}>
                <th className={ADMIN_TABLE_HEAD_CELL}>Name</th>
                <th className={ADMIN_TABLE_HEAD_CELL}>Extension</th>
                <th className={ADMIN_TABLE_HEAD_CELL}>Phone</th>
                <th className={ADMIN_TABLE_HEAD_CELL}>Status</th>
                <th className={ADMIN_TABLE_HEAD_CELL}>Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
              {loading &&
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={`sk-${i}`}>
                    <td className="px-4 py-3" colSpan={5}>
                      <Skeleton height={20} />
                    </td>
                  </tr>
                ))}

              {!loading && sortedAgents.length === 0 && (
                <tr>
                  <td
                    className="px-4 py-8 text-center text-slate-500"
                    colSpan={5}
                  >
                    No agents yet. Click Create agent to add one.
                  </td>
                </tr>
              )}

              {!loading &&
                sortedAgents.map((agent) => {
                  const isEditing = editingId === agent.id;
                  const draft = isEditing ? editDraft : null;

                  return (
                    <tr key={agent.id} className="hover:bg-slate-50/80">
                        <td className="px-4 py-3">
                          {isEditing && draft ? (
                            <input
                              className={inputClass}
                              value={draft.name}
                              onChange={(e) =>
                                patchEditDraft({ name: e.target.value })
                              }
                            />
                          ) : (
                            <span className="font-medium text-slate-800">
                              {agent.name}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {isEditing && draft ? (
                            <input
                              className={`${inputClass} max-w-[8rem]`}
                              value={draft.twilioPhoneNumberExt}
                              onChange={(e) =>
                                patchEditDraft({
                                  twilioPhoneNumberExt: e.target.value,
                                })
                              }
                            />
                          ) : (
                            agent.twilioPhoneNumberExt
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {isEditing && draft ? (
                            <input
                              className={inputClass}
                              value={draft.twilioPhoneNumber}
                              onChange={(e) =>
                                patchEditDraft({
                                  twilioPhoneNumber: e.target.value,
                                })
                              }
                            />
                          ) : (
                            agent.twilioPhoneNumber
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {isEditing && draft ? (
                            <select
                              className={inputClass}
                              value={draft.status}
                              onChange={(e) =>
                                patchEditDraft({
                                  status: e.target.value as AgentStatus,
                                })
                              }
                            >
                              {AGENT_STATUSES.map((status) => (
                                <option key={status} value={status}>
                                  {STATUS_LABEL[status]}
                                </option>
                              ))}
                            </select>
                          ) : (
                            STATUS_LABEL[agent.status]
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {!isEditing && (
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                disabled={!!editingId || saving}
                                onClick={() => startEdit(agent)}
                                className={`${actionBtnClass} border border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:text-blue-700`}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                disabled={!!editingId || saving}
                                onClick={() => handleDelete(agent)}
                                className="inline-flex rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-red-200 disabled:cursor-not-allowed disabled:opacity-40"
                                aria-label={`Delete ${agent.name}`}
                              >
                                <FaTrashAlt className="h-4 w-4" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                  );
                })}
            </tbody>
          </table>
        </div>

        {editingAgent && editDraft && (
          <div className="flex shrink-0 flex-col gap-3 border-t border-slate-200 bg-slate-50/80 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            {rowError ? (
              <p className="text-sm text-red-600">{rowError}</p>
            ) : (
              <p className="text-xs text-slate-500">
                Editing {editingAgent.name}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={cancelEdit}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => handleSaveEdit(editingAgent)}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
