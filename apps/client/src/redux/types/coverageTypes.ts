import type { PatientInfo } from "./appointmentsTypes";

export type CoverageData = PatientInfo & {
  deductible: string;
  maxAnnualBenefit: string;
  coverage: {
    [key: string]: string;
  };
};
