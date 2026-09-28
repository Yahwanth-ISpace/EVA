import { Test, TestingModule } from '@nestjs/testing';
import { AiService } from './ai.service';

describe('AiService', () => {
  let service: AiService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AiService],
    }).compile();

    service = module.get<AiService>(AiService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('validateAndNormalizeBenefitExtracted — unavailable answers', () => {
    it('stores NA for negative / not-available phrases on any field', () => {
      const cases: Array<[string, string, string]> = [
        ['coverage', 'not covered', 'it is not covered'],
        ['deductible', 'no', 'no'],
        ['history.D0120', 'no history', 'there is no history on file'],
        ['copay', 'not available', 'that is not available'],
        ['validity', 'not provided', 'not provided'],
      ];
      for (const [field, extracted, userSaid] of cases) {
        const result = service.validateAndNormalizeBenefitExtracted(
          { [field]: extracted },
          userSaid,
          [field],
        );
        expect(result).toEqual({ ok: true, normalized: { [field]: 'NA' } });
      }
    });
  });

  describe('validateAndNormalizeBenefitExtracted — effective date', () => {
    const field = 'ORIGINAL EFFECTIVE DATE';

    it('accepts today and past effective dates', () => {
      const today = new Date();
      const mm = String(today.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(today.getUTCDate()).padStart(2, '0');
      const yyyy = today.getUTCFullYear();
      const todayStr = `${mm}/${dd}/${yyyy}`;

      const todayResult = service.validateAndNormalizeBenefitExtracted(
        { [field]: todayStr },
        todayStr,
        [field],
      );
      expect(todayResult).toEqual({ ok: true, normalized: { [field]: todayStr } });

      const pastResult = service.validateAndNormalizeBenefitExtracted(
        { [field]: '01/01/2020' },
        'January 1st 2020',
        [field],
      );
      expect(pastResult).toEqual({
        ok: true,
        normalized: { [field]: '01/01/2020' },
      });
    });

    it('rejects future effective dates', () => {
      const result = service.validateAndNormalizeBenefitExtracted(
        { [field]: '01/15/2030' },
        'January 15th 2030',
        [field],
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.invalidField).toBe(field);
        expect(result.correctionMessage).toMatch(/future/i);
      }
    });
  });
});
