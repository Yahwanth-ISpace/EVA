import { Injectable, NotFoundException } from '@nestjs/common';
import { MongoService } from '../mongo/mongo.service';
import { CreateProviderDto } from './dto/create-provider.dto';

@Injectable()
export class ProviderService {
  constructor(private readonly mongoService: MongoService) {}

  async create(dto: CreateProviderDto) {
    const provider = {
      firstName: dto.firstName,
      lastName: dto.lastName,
      npi: dto.npi,
      network: dto.network,
      specialty: dto.specialty,
    };
    const result = await (await this.mongoService.collection('Provider'))
      .insertOne(provider);
    return this.withOffices({ ...provider, _id: result.insertedId });
  }

  async findAll() {
    const providers = await (await this.mongoService.collection('Provider'))
      .find({})
      .toArray();
    return Promise.all(providers.map((provider) => this.withOffices(provider)));
  }

  async findOne(id: string) {
    const provider = await (await this.mongoService.collection('Provider'))
      .findOne(this.mongoService.idFilter(id));

    if (!provider) {
      throw new NotFoundException('Provider not found');
    }

    return this.withOffices(provider);
  }

  private async withOffices<T extends { _id: unknown }>(provider: T) {
    const offices = await (await this.mongoService.collection('Office'))
      .find({ providerId: provider._id })
      .toArray();
    return this.mongoService.withIds({ ...provider, offices });
  }
}
