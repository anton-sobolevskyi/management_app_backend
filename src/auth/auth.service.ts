import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { hashToken } from '../common/utils/token-hash';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async register(
    dto: RegisterDto,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const existingUser = await this.prisma.user.findFirst({
      where: { email: dto.email, deletedAt: null },
    });

    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        name: dto.name,
      },
    });

    return this.generateTokens(user.id, user.email);
  }

  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
    });

    if (!user) {
      return null;
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      return null;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, ...result } = user;
    return result;
  }

  async login(
    userId: string,
    email: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    await this.purgeExpiredTokens();
    return this.generateTokens(userId, email);
  }

  async refreshTokens(refreshToken: string) {
    const tokenHash = hashToken(refreshToken);

    const stored = await this.prisma.refreshToken.findUnique({
      where: { token: tokenHash },
      include: { user: true },
    });

    if (
      !stored ||
      stored.revoked ||
      stored.expiresAt < new Date() ||
      stored.user.deletedAt
    ) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revoked: true },
    });

    await this.purgeExpiredTokens();
    return this.generateTokens(stored.user.id, stored.user.email);
  }

  async logout(refreshToken: string) {
    const tokenHash = hashToken(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { token: tokenHash },
      data: { revoked: true },
    });
  }

  /** Delete expired or long-revoked refresh tokens to keep the table lean. */
  async purgeExpiredTokens() {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    await this.prisma.refreshToken.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date() } },
          { revoked: true, createdAt: { lt: cutoff } },
        ],
      },
    });
  }

  private async generateTokens(userId: string, email: string) {
    const payload = { sub: userId, email };

    const accessToken = this.jwtService.sign(payload, {
      secret: process.env.JWT_ACCESS_SECRET as string,
      expiresIn: '15m',
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: process.env.JWT_REFRESH_SECRET as string,
      expiresIn: '7d',
    });

    await this.prisma.refreshToken.create({
      data: {
        token: hashToken(refreshToken),
        userId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    return { accessToken, refreshToken };
  }
}
