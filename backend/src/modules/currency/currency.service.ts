import { CurrencyRepository } from './currency.repository';

export class CurrencyService {
  constructor(private readonly currencies = new CurrencyRepository()) {}

  async list() {
    const rows = await this.currencies.findAllActive();
    return rows.map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      module: c.module,
      perCreditPaise: c.perCreditPaise,
      plans: ((c as unknown as { plans?: Array<{ id: number; label: string; credits: number; totalPaise: number }> }).plans || []).map(
        (p) => ({
          id: p.id,
          label: p.label,
          credits: p.credits,
          totalPaise: p.totalPaise,
        }),
      ),
    }));
  }
}
