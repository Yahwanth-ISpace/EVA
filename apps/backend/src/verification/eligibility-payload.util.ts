import type { AiService } from '../ai/ai.service';

export type EligibilityExtracted = Record<string, string | null | undefined>;

export class EligibilityPayloadUtil {
  private static buildSpecialitiesFromHistory(
    historyItems: Array<Record<string, any>> | undefined,
    extracted?: EligibilityExtracted,
    aiService?: Pick<AiService, 'normalizeMoney' | 'normalizeHistoryDates'>,
  ) {
    const procedures = (historyItems ?? []).map((item) => {
      const procedureCode = String(item?.procedureCode ?? '').trim();
      const rawAnswer =
        item?.answer ??
        extracted?.[`history.${procedureCode}`] ??
        extracted?.[procedureCode];
      const normalizedHistory = aiService?.normalizeHistoryDates(rawAnswer);

      return {
        procedureCode,
        history:
          normalizedHistory != null && String(normalizedHistory).trim() !== ''
            ? String(normalizedHistory)
            : null,
      };
    });

    return {
      procedures,
    };
  }

  static build(
    appointment: Record<string, any>,
    extracted?: EligibilityExtracted,
    aiService?: Pick<AiService, 'normalizeMoney' | 'normalizeHistoryDates'>,
  ) {
    if (!aiService) {
      throw new Error('AiService is required to build eligibility payload');
    }

    const numericFields = new Set([
      'individualMetAmount',
      'familyMetAmount',
      'yearlyMaxUsed',
      'orthoMaximum',
      'individualDeductibleMet',
      'individualDeductible',
      'familyDeductibleMet',
      'familyDeductible',
      'familyMaxUsed',
      'yearlyMaxAmount',
      'preventive',
      'basic',
      'major',
    ]);

    const insuranceFieldNames = new Set([
      'groupName',
      'groupNumber',
      'familyDeductible',
      'individualDeductible',
      'yearlyMaxAmount',
      'preventive',
      'preventive(D0120)',
      'basic',
      'basic(D2160)',
      'major',
      'major(D2740)',
      'carrierName',
      'network',
    ]);

    const getNumericValue = (value?: string | null): string => {
      if (!value) return '';

      const cleaned = value
        .toLowerCase()
        .replace(/,/g, '')
        .replace(/dollars?|usd|\$/g, '')
        .trim();

      const numeric = cleaned.match(/\d+(\.\d+)?/);

      if (numeric) {
        return numeric[0];
      }

      return aiService.normalizeMoney(cleaned);
    };

    const getValueFromSources = (keys: string[]): string => {
      for (const key of keys) {
        // 1. Check extracted values first
        if (extracted && Object.prototype.hasOwnProperty.call(extracted, key)) {
          const value = extracted[key];

          if (value != null && String(value).trim() !== '') {
            return String(value);
          }
        }

        // 2. Check benefitsInfo
        const benefitValue = appointment?.benefitsInfo?.[key];

        if (benefitValue == null) {
          continue;
        }

        // history is handled separately
        if (key === 'history') {
          continue;
        }

        // New Sabrina format
        // {
        //   question: "...",
        //   rule: "...",
        //   answer: "..."
        // }
        if (
          typeof benefitValue === 'object' &&
          !Array.isArray(benefitValue) &&
          'answer' in benefitValue
        ) {
          const answer = (benefitValue as any).answer;

          if (Array.isArray(answer)) {
            return aiService.normalizeHistoryDates(answer.join(','));
          }

          if (answer != null) {
            return String(answer);
          }

          continue;
        }

        // Legacy plain string
        if (typeof benefitValue === 'string') {
          return benefitValue;
        }

        // Primitive values
        if (
          typeof benefitValue === 'number' ||
          typeof benefitValue === 'boolean'
        ) {
          return String(benefitValue);
        }
      }

      return '';
    };

    const insurance = {
      groupName: getValueFromSources([
        'GroupName',
        'Insurance_GroupName',
        'groupName',
      ]),
      groupNumber: getValueFromSources([
        'GroupNumber',
        'Insurance_GroupNumber',
        'groupNumber',
      ]),
      familyDeductible: getNumericValue(
        getValueFromSources(['FamilyDeductible', 'familyDeductible']),
      ),
      individualDeductible: getNumericValue(
        getValueFromSources(['IndividualDeductible', 'individualDeductible']),
      ),
      yearlyMaxAmount: getNumericValue(
        getValueFromSources(['YearlyMaxAmount', 'yearlyMaxAmount']),
      ),
      preventive: getNumericValue(
        getValueFromSources(['Preventive', 'Preventive(D0120)', 'preventive']),
      ),
      basic: getNumericValue(
        getValueFromSources(['Basic', 'Basic(D2160)', 'basic']),
      ),
      major: getNumericValue(
        getValueFromSources(['Major', 'Major(D2740)', 'major']),
      ),
      carrierName: getValueFromSources([
        'InsuranceCompany_Name',
        'carrierName',
        'companyName',
      ]),
      network: getValueFromSources(['Provider_Network', 'network']),
    };

    const benefitsInfo: Record<string, any> = {};

    const rawHistoryItems = Array.isArray(appointment?.history)
      ? appointment.history
      : Array.isArray(appointment?.benefitsInfo?.history)
        ? appointment.benefitsInfo.history
        : [];

    for (const [key, value] of Object.entries(
      appointment?.benefitsInfo ?? {},
    )) {
      if (key === 'history') {
        continue;
      }

      if (insuranceFieldNames.has(key)) {
        continue;
      }

      const fieldValue = getValueFromSources([key]);
      benefitsInfo[key] = numericFields.has(key)
        ? getNumericValue(fieldValue)
        : fieldValue;
    }

    const { InsuranceCompany_Phone, InsuranceCompany_Phone_Ext, ...payload } =
      appointment;

    const specialities = this.buildSpecialitiesFromHistory(
      rawHistoryItems,
      extracted,
      aiService,
    );

    return {
      ...payload,
      insurance,
      benefitsInfo,
      ...(specialities.procedures.length > 0
        ? { specialities }
        : { specialities: { procedures: [] } }),
    };
  }
}
