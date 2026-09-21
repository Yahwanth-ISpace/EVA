import { useState } from "react";

export interface InsuranceFilterValues {
  search: string;
  status: string;
  appointmentStatus: string;
  payer: string;
  dateFrom: string;
  dateTo: string;
}

interface InsuranceFiltersProps {
  value: InsuranceFilterValues;
  onChange: (filters: InsuranceFilterValues) => void;
  payers?: string[];
}

export default function InsuranceFilters({
  value,
  onChange,
  payers = [],
}: InsuranceFiltersProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const updateFilter = (
    key: keyof InsuranceFilterValues,
    newValue: string
  ) => {
    onChange({
      ...value,
      [key]: newValue,
    });
  };

  const clearFilters = () => {
    onChange({
      search: "",
      status: "",
      appointmentStatus: "",
      payer: "",
      dateFrom: "",
      dateTo: "",
    });
  };

  const activeFilterCount = Object.values(value).filter(Boolean).length;

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          {/* Search */}
          <div className="relative flex-1">
            <svg
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="m21 21-4.35-4.35m1.35-5.65a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z"
              />
            </svg>

            <input
              type="text"
              value={value.search}
              onChange={(e) => updateFilter("search", e.target.value)}
              placeholder="Search patient or appointment ID..."
              className="w-full rounded-lg border border-gray-300 bg-gray-50 py-2.5 pl-10 pr-4 text-sm text-gray-900 outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          {/* Verification Status */}
          <select
            value={value.status}
            onChange={(e) => updateFilter("status", e.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
          >
            <option value="">Verification Status</option>
            <option value="Verified">Verified</option>
            <option value="Pending">Pending</option>
            <option value="Failed">Failed</option>
            <option value="Re-work">Re-work</option>
          </select>

          {/* Appointment Status */}
          <select
            value={value.appointmentStatus}
            onChange={(e) =>
              updateFilter("appointmentStatus", e.target.value)
            }
            className="rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
          >
            <option value="">Appointment Status</option>
            <option value="READY">Ready</option>
            <option value="INPROGRESS">In Progress</option>
            <option value="COMPLETED">Completed</option>
            <option value="SUSPENDED">Suspended</option>
          </select>

          <button
            type="button"
            onClick={() => setShowAdvanced((prev) => !prev)}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
          >
            Filters
            {activeFilterCount > 0 && (
              <span className="ml-2 rounded-full bg-indigo-100 px-2 py-0.5 text-xs text-indigo-700">
                {activeFilterCount}
              </span>
            )}
          </button>

          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={clearFilters}
              className="px-2 py-2 text-sm font-medium text-gray-500 hover:text-gray-800"
            >
              Clear
            </button>
          )}
        </div>

        {/* Advanced Filters */}
        {showAdvanced && (
          <div className="mt-4 grid grid-cols-1 gap-3 border-t border-gray-100 pt-4 md:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                Payer
              </label>

              <select
                value={value.payer}
                onChange={(e) => updateFilter("payer", e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              >
                <option value="">All Payers</option>

                {payers.map((payer) => (
                  <option key={payer} value={payer}>
                    {payer}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                From
              </label>

              <input
                type="date"
                value={value.dateFrom}
                onChange={(e) => updateFilter("dateFrom", e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                To
              </label>

              <input
                type="date"
                value={value.dateTo}
                onChange={(e) => updateFilter("dateTo", e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}