import { Injectable, NotFoundException } from '@nestjs/common';
import { Document } from 'mongodb';
import { MongoService } from '../mongo/mongo.service';
import { CreateOfficeDto } from './dto/create-office.dto';

@Injectable()
export class OfficeService {
  constructor(private readonly mongoService: MongoService) {}

  async create(dto: CreateOfficeDto) {
    const office = {
      name: dto.name,
      address1: dto.address1,
      address2: dto.address2 ?? null,
      city: dto.city,
      state: dto.state,
      zip: dto.zip,
      code: dto.code,
      providerId: this.mongoService.toObjectId(dto.providerId),
    };
    const result = await (await this.mongoService.collection('Office'))
      .insertOne(office);
    return this.withProvider({ ...office, _id: result.insertedId });
  }

  async findAll() {
    const offices = await (await this.mongoService.collection('Office'))
      .find({})
      .toArray();
    return Promise.all(offices.map((office) => this.withProvider(office)));
  }

  async findByProviderId(providerId: string) {
    const offices = await (await this.mongoService.collection('Office'))
      .find({ providerId: this.mongoService.toObjectId(providerId) })
      .toArray();
    return Promise.all(offices.map((office) => this.withProvider(office)));
  }

  async findOne(id: string) {
    const office = await (await this.mongoService.collection('Office'))
      .findOne(this.mongoService.idFilter(id));

    if (!office) throw new NotFoundException('Office not found');

    return this.withProvider(office);
  }

  private async withProvider<T extends Document>(office: T) {
    const providerId = office.providerId;
    const provider =
      providerId != null
        ? await (await this.mongoService.collection('Provider')).findOne({
            _id: providerId,
          })
        : null;
    return this.mongoService.withIds({ ...office, provider });
  }
}
