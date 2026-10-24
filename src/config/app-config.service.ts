import { Injectable } from '@nestjs/common';
import { AppConfig, getAppConfig } from './app.config';

/**
 * Typed, immutable view of the environment, parsed ONCE when the application
 * starts. Inject it instead of calling `getAppConfig()` (which re-parses the
 * environment on every call and cannot be replaced in tests).
 *
 * It is provided through a factory in AppConfigModule, so the constructor
 * argument is a plain parameter and not an injection token. Tests build one
 * from an explicit environment: `new AppConfigService({ NODE_ENV: 'test' })`.
 */
@Injectable()
export class AppConfigService implements AppConfig {
  readonly nodeEnv: AppConfig['nodeEnv'];
  readonly isProduction: AppConfig['isProduction'];
  readonly jwt: AppConfig['jwt'];
  readonly bcryptRounds: AppConfig['bcryptRounds'];
  readonly s3: AppConfig['s3'];
  readonly db: AppConfig['db'];
  readonly swaggerEnabled: AppConfig['swaggerEnabled'];
  readonly throttlingDisabled: AppConfig['throttlingDisabled'];
  readonly mail: AppConfig['mail'];
  readonly maxConcurrentUploads: AppConfig['maxConcurrentUploads'];
  readonly rateLimit: AppConfig['rateLimit'];
  readonly backgroundJobsEnabled: AppConfig['backgroundJobsEnabled'];

  constructor(env: NodeJS.ProcessEnv = process.env) {
    const config = getAppConfig(env);
    this.nodeEnv = config.nodeEnv;
    this.isProduction = config.isProduction;
    this.jwt = config.jwt;
    this.bcryptRounds = config.bcryptRounds;
    this.s3 = config.s3;
    this.db = config.db;
    this.swaggerEnabled = config.swaggerEnabled;
    this.throttlingDisabled = config.throttlingDisabled;
    this.mail = config.mail;
    this.maxConcurrentUploads = config.maxConcurrentUploads;
    this.rateLimit = config.rateLimit;
    this.backgroundJobsEnabled = config.backgroundJobsEnabled;
  }
}
