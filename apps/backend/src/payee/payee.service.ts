import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Document } from 'mongodb';
import { MongoService } from '../mongo/mongo.service';
import { CreatePayeeDto } from './dto/create-payee.dto';
import { PayerDto } from 'src/auth/dto/auth.dto';

@Injectable()
export class PayeeService {
  constructor(private readonly mongoService: MongoService) {}

  async create(data: CreatePayeeDto | undefined) {
    if (!data) throw new BadRequestException('Missing payee data');

    const payerId = data.payer
      ? await this.resolvePayerId(data.payer)
      : null;
    const payee = {
      firstName: data.firstName,
      lastName: data.lastName,
      dob: data.dob ?? null,
      ssn: data.ssn ?? null,
      userId: null,
      payerId,
    };
    const result = await (await this.mongoService.collection('Payee'))
      .insertOne(payee);
    return this.mongoService.withIds({ ...payee, _id: result.insertedId });
  }

  async findAll() {
    const payees = await (await this.mongoService.collection('Payee'))
      .find({})
      .toArray();
    return Promise.all(payees.map((payee) => this.withRelations(payee)));
  }

  async findOne(id: string) {
    const payee = await (await this.mongoService.collection('Payee')).findOne(
      this.mongoService.idFilter(id),
    );
    return payee ? this.withRelations(payee) : null;
  }

  async update(id: string, data: Partial<CreatePayeeDto>) {
    const existing = await this.findOne(id);
    if (!existing) {
      throw new NotFoundException('Payee not found');
    }

    const updateData: Record<string, unknown> = {};
    if (data.firstName !== undefined) updateData.firstName = data.firstName;
    if (data.lastName !== undefined) updateData.lastName = data.lastName;
    if (data.dob !== undefined) updateData.dob = data.dob ?? null;
    if (data.ssn !== undefined) updateData.ssn = data.ssn ?? null;
    if (data.payer) {
      updateData.payerId = await this.resolvePayerId(data.payer);
    }

    await (await this.mongoService.collection('Payee')).updateOne(
      this.mongoService.idFilter(id),
      { $set: updateData },
    );
    return this.findOne(id);
  }

  private async resolvePayerId(payer: PayerDto) {
    const payers = await this.mongoService.collection('Payer');
    const existing = await payers.findOne(this.mongoService.idFilter(payer.id));
    if (existing) return existing._id;
    const created = {
      companyName: payer.companyName,
      phone: payer.phone,
      phoneExt: payer.phoneExt ?? null,
      groupName: payer.groupName,
      groupNumber: payer.groupNumber,
      businessKey: payer.businessKey,
      planName: payer.planName,
      pristinePlanId: payer.pristinePlanId,
    };
    const result = await payers.insertOne(created);
    return result.insertedId;
  }

  private async withRelations<T extends Document>(
    payee: T,
  ) {
    const [payer, user] = await Promise.all([
      payee.payerId != null
        ? (await this.mongoService.collection('Payer')).findOne({
            _id: payee.payerId,
          })
        : null,
      payee.userId != null
        ? (await this.mongoService.collection('User')).findOne({
            _id: payee.userId,
          })
        : null,
    ]);
    return this.mongoService.withIds({ ...payee, payer, user });
  }
}
