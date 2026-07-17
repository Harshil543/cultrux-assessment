import { z } from 'zod';
import { sequelize } from '../../models';
import { ConflictError, UnauthorizedError } from '../../common/errors/AppError';
import { comparePassword, hashPassword, signToken } from '../../common/utils/auth';
import { UserRepository } from './auth.repository';
import { WalletRepository } from '../wallet/wallet.repository';
import { CurrencyRepository } from '../currency/currency.repository';

const credentialsSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
});

export class AuthService {
  constructor(
    private readonly users = new UserRepository(),
    private readonly wallets = new WalletRepository(),
    private readonly currencies = new CurrencyRepository(),
  ) {}

  async signup(input: unknown) {
    const { email, password } = credentialsSchema.parse(input);
    const normalizedEmail = email.toLowerCase().trim();

    const existing = await this.users.findByEmail(normalizedEmail);
    if (existing) {
      throw new ConflictError('Email already registered', 'EMAIL_TAKEN');
    }

    const passwordHash = await hashPassword(password);

    const result = await sequelize.transaction(async (transaction) => {
      const user = await this.users.create(
        { email: normalizedEmail, passwordHash },
        transaction,
      );

      const wallet = await this.wallets.createForUser(user.id, transaction);
      const activeCurrencies = await this.currencies.findAllActive(transaction);

      await this.wallets.createZeroBalances(
        wallet.id,
        activeCurrencies.map((c) => c.id),
        transaction,
      );

      return user;
    });

    const accessToken = signToken({ userId: result.id, email: result.email });
    return {
      accessToken,
      user: { id: result.id, email: result.email },
    };
  }

  async login(input: unknown) {
    const { email, password } = credentialsSchema.parse(input);
    const normalizedEmail = email.toLowerCase().trim();

    const user = await this.users.findByEmail(normalizedEmail);
    if (!user) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const ok = await comparePassword(password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const accessToken = signToken({ userId: user.id, email: user.email });
    return {
      accessToken,
      user: { id: user.id, email: user.email },
    };
  }

  async me(userId: number) {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new UnauthorizedError();
    }
    return { id: user.id, email: user.email };
  }
}

export const signupSchema = credentialsSchema;
export const loginSchema = credentialsSchema;
