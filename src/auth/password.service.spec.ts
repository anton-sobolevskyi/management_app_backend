import * as bcrypt from 'bcrypt';
import { PasswordService } from './password.service';
import { AppConfigService } from '../config/app-config.service';

describe('PasswordService', () => {
  // Real bcrypt at the minimum cost the config allows keeps this fast
  const service = new PasswordService(
    new AppConfigService({ BCRYPT_ROUNDS: '10' }),
  );

  it('hashes with the configured cost and verifies the password', async () => {
    const hash = await service.hash('secret-pass-1');
    expect(bcrypt.getRounds(hash)).toBe(10);
    await expect(service.verify('secret-pass-1', hash)).resolves.toBe(true);
    await expect(service.verify('other-pass-1', hash)).resolves.toBe(false);
  });

  it('builds the dummy hash only once and never throws', async () => {
    const hashSpy = jest.spyOn(service, 'hash');
    await service.verifyAgainstDummy('a');
    await service.verifyAgainstDummy('b');
    expect(hashSpy).toHaveBeenCalledTimes(1);
    hashSpy.mockRestore();
  });
});
