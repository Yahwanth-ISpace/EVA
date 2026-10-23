import { Test, TestingModule } from '@nestjs/testing';
import { PayeeService } from './payee.service';
import { MongoService } from '../mongo/mongo.service';

describe('PayeeService', () => {
  let service: PayeeService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayeeService,
        { provide: MongoService, useValue: {} },
      ],
    }).compile();

    service = module.get<PayeeService>(PayeeService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
