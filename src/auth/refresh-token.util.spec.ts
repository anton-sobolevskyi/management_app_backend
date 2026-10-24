import { revokeAllRefreshTokens } from './refresh-token.util';

describe('revokeAllRefreshTokens', () => {
  const updateMany = jest.fn().mockReturnValue('op');
  const db = { refreshToken: { updateMany } } as any;

  it('revokes only the still-active tokens of the user', () => {
    const at = new Date('2026-10-24T10:00:00Z');
    expect(revokeAllRefreshTokens(db, 'u1', at)).toBe('op');
    expect(updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', revoked: false },
      data: { revoked: true, revokedAt: at },
    });
  });

  it('stamps the current time by default', () => {
    void revokeAllRefreshTokens(db, 'u1');
    const { data } = updateMany.mock.calls[0][0];
    expect(data.revokedAt).toBeInstanceOf(Date);
  });
});
