export type PatientInfo = {
  name: string;
  dob: string;
  provider: string;
  memberId: string;
};

export type CoverageData = PatientInfo & {
  deductible: string;
  maxAnnualBenefit: string;
  coverage: {
    [key: string]: string;
  };
};
