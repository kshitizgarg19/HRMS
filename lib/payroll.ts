/** Shared payslip math — used by the seeder and the payroll run API so numbers always agree. */

export interface SalaryParts {
  basic: number;
  hra: number;
  special_allowance: number;
  conveyance: number;
}

export function grossOf(s: SalaryParts): number {
  return s.basic + s.hra + s.special_allowance + s.conveyance;
}

export function computePayslip(s: SalaryParts, month: number, year: number, lopDays = 0) {
  const gross = grossOf(s);
  const daysInMonth = new Date(year, month, 0).getDate();
  const perDay = gross / 30;
  const lop_amount = Math.round(perDay * lopDays);
  const pf = Math.round(s.basic * 0.12);
  const prof_tax = gross > 21000 ? 200 : 0;
  const tdsRate = gross <= 60000 ? 0.03 : gross <= 100000 ? 0.06 : 0.1;
  const tds = Math.round(gross * tdsRate);
  const total_deductions = pf + prof_tax + tds + lop_amount;
  const net = Math.round(gross - total_deductions);
  return {
    basic: s.basic,
    hra: s.hra,
    special_allowance: s.special_allowance,
    conveyance: s.conveyance,
    gross,
    pf,
    prof_tax,
    tds,
    lop_days: lopDays,
    lop_amount,
    total_deductions,
    net,
    paid_days: daysInMonth - lopDays,
  };
}
