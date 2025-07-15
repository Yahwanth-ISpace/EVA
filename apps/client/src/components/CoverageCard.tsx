import type { CoverageData } from "../types/insurance";

export default function CoverageCard({ data }: { data: CoverageData }) {
  return (
    <div className="p-4 border rounded-lg bg-gray-50 shadow-md mb-4">
      <h3 className="text-lg font-semibold">
        {data.name} - {data.provider}
      </h3>
      <p>DOB: {data.dob}</p>
      <ul className="mt-2">
        {Object.entries(data.coverage || {}).map(([key, value]) => (
          <li key={key}>
            <strong>{key}:</strong> {value}
          </li>
        ))}
      </ul>
      <p className="mt-2">Max Benefit: {data.maxAnnualBenefit}</p>
      <p>Deductible: {data.deductible}</p>
    </div>
  );
}
