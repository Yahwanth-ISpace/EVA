import { Injectable, NotFoundException } from '@nestjs/common';
import { MongoService } from '../mongo/mongo.service';
import { CreatePayerDto } from './dto/create-payer.dto';

@Injectable()
export class PayerService {
  constructor(private readonly mongoService: MongoService) {}

  async create(createPayerDto: CreatePayerDto) {
    const payer = {
      ...createPayerDto,
      phoneExt: createPayerDto.phoneExt ?? null,
    };
    const result = await (await this.mongoService.collection('Payer')).insertOne(
      payer,
    );
    return this.mongoService.withIds({ ...payer, _id: result.insertedId });
  }

  async findAll() {
    const payers = await (await this.mongoService.collection('Payer'))
      .find({})
      .toArray();
    return this.mongoService.withIds(payers);
  }

  async findOne(id: string) {
    const payer = await (await this.mongoService.collection('Payer')).findOne(
      this.mongoService.idFilter(id),
    );
    if (!payer) {
      throw new NotFoundException(`Payer with id ${id} not found`);
    }
    return this.mongoService.withIds(payer);
  }
}
