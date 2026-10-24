import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { AppConfigService } from '../config/app-config.service';

/**
 * The only place that talks to bcrypt: hashing cost comes from the config and
 * the login timing defence lives next to the comparison it protects.
 */
@Injectable()
export class PasswordService {
  private dummyHash?: Promise<string>;

  constructor(private config: AppConfigService) {}

  hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, this.config.bcryptRounds);
  }

  verify(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }

  /**
   * Spend the time of a real comparison when no account matched, so response
   * timing does not reveal which e-mail addresses are registered.
   */
  async verifyAgainstDummy(plain: string): Promise<void> {
    this.dummyHash ??= this.hash(randomUUID());
    await bcrypt.compare(plain, await this.dummyHash);
  }
}
