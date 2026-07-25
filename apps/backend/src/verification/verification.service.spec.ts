import { EligibilityPayloadUtil } from './eligibility-payload.util';

describe('EligibilityPayloadUtil', () => {
  const aiService = {
    normalizeMoney: (value: string) => value,
    normalizeHistoryDates: (value?: string | null) => value ?? '',
  };

  it('should build the eligibility payload with segregated insurance, benefits, and history sections', () => {
    const payload = EligibilityPayloadUtil.build(
      {
        PatientID: '12345',
        InsuranceCompany_Name: 'United Health Group',
        Provider_Network: 'IN',
        benefitsInfo: {
          GroupName: { answer: 'United Health Group' },
          GroupNumber: { answer: '5678' },
          FamilyDeductible: { answer: '1000' },
          IndividualDeductible: { answer: '500' },
          YearlyMaxAmount: { answer: '100' },
          Preventive: { answer: '50' },
          Basic: { answer: '20' },
          Major: { answer: '20' },
          OrthoMaximum: { answer: '2000' },
          history: [{ procedureCode: 'D0120', description: 'Periodic Exam' }],
        },
      },
      {
        GroupName: 'United Health Group',
        GroupNumber: '5678',
        FamilyDeductible: '1000',
        IndividualDeductible: '500',
        YearlyMaxAmount: '100',
        Preventive: '50',
        Basic: '20',
        Major: '20',
        OrthoMaximum: '2000',
      },
      aiService as any,
    );

    expect(payload.insurance).toEqual({
      groupName: 'United Health Group',
      groupNumber: '5678',
      familyDeductible: '1000',
      individualDeductible: '500',
      yearlyMaxAmount: '100',
      preventive: '50',
      basic: '20',
      major: '20',
      carrierName: 'United Health Group',
      network: 'IN',
    });

    expect(payload.benefitsInfo).toEqual({
      OrthoMaximum: '2000',
    });

    expect(payload.specialities).toEqual({
      procedures: [
        {
          procedureCode: 'D0120',
          history: '',
        },
      ],
    });
  });

  it('should move history into specialities and remove history from the top-level payload', () => {
    const payload = EligibilityPayloadUtil.build(
      {
        PatientID: '12345',
        benefitsInfo: {
          history: [
            {
              procedureCode: 'D0120',
              description: 'Periodic Exam',
              answer: '10-07-2026',
            },
            {
              procedureCode: 'D2391',
              description: 'Composite Filling',
              answer: '20-07-2026',
            },
          ],
        },
      },
      {},
      aiService as any,
    );

    expect((payload as any).history).toBeUndefined();
    expect(payload.specialities).toEqual({
      procedures: [
        {
          procedureCode: 'D0120',
          history: '10-07-2026',
        },
        {
          procedureCode: 'D2391',
          history: '20-07-2026',
        },
      ],
    });
  });
});
