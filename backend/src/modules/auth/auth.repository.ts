import { Transaction } from 'sequelize';
import { User, UserCreationAttributes } from '../../models/User';

export class UserRepository {
  async findByEmail(email: string): Promise<User | null> {
    return User.findOne({ where: { email } });
  }

  async findById(id: number): Promise<User | null> {
    return User.findByPk(id);
  }

  async create(data: UserCreationAttributes, transaction?: Transaction): Promise<User> {
    return User.create(data, { transaction });
  }

  async updateStripeCustomerId(userId: number, stripeCustomerId: string): Promise<void> {
    await User.update({ stripeCustomerId }, { where: { id: userId } });
  }
}
