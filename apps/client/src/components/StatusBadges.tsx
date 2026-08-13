interface StatusBadgeProps {
  status?: string | null;
}

const STATUS_STYLES: Record<string, string> = {
  Verified: "bg-green-50 text-green-700 ring-green-600/20",
  Pending: "bg-yellow-50 text-yellow-700 ring-yellow-600/20",
  "In Progress": "bg-blue-50 text-blue-700 ring-blue-600/20",
  Failed: "bg-red-50 text-red-700 ring-red-600/20",
  "Re-work": "bg-orange-50 text-orange-700 ring-orange-600/20",
};

export default function StatusBadge({ status }: StatusBadgeProps) {
  const normalizedStatus = status?.trim() || "Unknown";

  const statusStyle =
    STATUS_STYLES[normalizedStatus] ||
    "bg-gray-50 text-gray-600 ring-gray-500/20";

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${statusStyle}`}
    >
      {normalizedStatus}
    </span>
  );
}