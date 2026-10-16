// Weekly paycheck withholding estimate, 2026 tables.
// Federal: IRS Pub 15-T (2026) percentage method, annualized, Single, standard withholding.
// New York State: NYS-50-T-NYS (1/26) Method II, weekly, Single.
// New York City: approximated from the annual NYC rate schedule, calibrated against a real 2026 pay stub.

const PERIODS = 52;

// Pub 15-T Worksheet 1A line 1g amount (Single, Step 2 not checked).
const FED_ADJUST = 8600;
// [at least, tentative amount, rate, of amount over]
const FED_SINGLE = [
  [0, 0, 0, 0],
  [7500, 0, 0.10, 7500],
  [19900, 1240, 0.12, 19900],
  [57900, 5800, 0.22, 57900],
  [113200, 17966, 0.24, 113200],
  [209275, 41024, 0.32, 209275],
  [263725, 58448, 0.35, 263725],
  [648100, 192979.25, 0.37, 648100],
];

// NYS weekly deduction allowance (Single, 0 exemptions) and Table II-A rows.
const NYS_WEEKLY_ALLOWANCE = 142.30;
// [net wages at least, subtract, multiply by, add]
const NYS_WEEKLY_SINGLE = [
  [0, 0, 0.0390, 0],
  [163, 163, 0.0440, 6.38],
  [225, 225, 0.0515, 9.08],
  [267, 267, 0.0540, 11.27],
  [1551, 1551, 0.0590, 80.58],
  [1862, 1862, 0.0703, 98.90],
  [2070, 2070, 0.0753, 113.58],
  [3032, 3032, 0.0640, 186.02],
  [4142, 4142, 0.1144, 257.10],
  [5104, 5104, 0.0735, 367.13],
];

// NYC annual resident rates; the allowance is calibrated to match a real 2026 pay stub.
const NYC_ANNUAL_ALLOWANCE = 2672;
const NYC_SINGLE = [
  [0, 0, 0.03078],
  [12000, 369.36, 0.03762],
  [25000, 858.42, 0.03819],
  [50000, 1813.17, 0.03876],
];

const SS_RATE = 0.062;
const SS_WAGE_BASE = 184500;
const MEDICARE_RATE = 0.0145;
const NY_PFL_RATE = 0.00432;
const NY_SDI_RATE = 0.005;
const NY_SDI_WEEKLY_MAX = 0.60;

const round2 = (n) => Math.round(n * 100) / 100;

function rowFor(table, amount) {
  let row = table[0];
  for (const r of table) if (amount >= r[0]) row = r;
  return row;
}

export function federalWeekly(gross) {
  const annual = Math.max(0, gross * PERIODS - FED_ADJUST);
  const [, base, rate, over] = rowFor(FED_SINGLE, annual);
  return round2(Math.max(0, base + rate * (annual - over)) / PERIODS);
}

export function nysWeekly(gross) {
  const net = Math.max(0, gross - NYS_WEEKLY_ALLOWANCE);
  const [, sub, rate, add] = rowFor(NYS_WEEKLY_SINGLE, net);
  return round2((net - sub) * rate + add);
}

export function nycWeekly(gross) {
  const annual = Math.max(0, gross * PERIODS - NYC_ANNUAL_ALLOWANCE);
  const [over, base, rate] = rowFor(NYC_SINGLE, annual);
  return round2((base + rate * (annual - over)) / PERIODS);
}

// gross: the week's taxable pay. ytdBefore: taxable pay earlier in the year (for the Social Security cap).
export function weeklyWithholding(gross, { ytdBefore = 0, nyc = true, otherDeductions = 0 } = {}) {
  const ssWages = Math.max(0, Math.min(gross, SS_WAGE_BASE - ytdBefore));
  const lines = {
    federal: federalWeekly(gross),
    socialSecurity: round2(ssWages * SS_RATE),
    medicare: round2(gross * MEDICARE_RATE),
    newYorkState: nysWeekly(gross),
    newYorkCity: nyc ? nycWeekly(gross) : 0,
    paidFamilyLeave: round2(gross * NY_PFL_RATE),
    disability: round2(Math.min(gross * NY_SDI_RATE, NY_SDI_WEEKLY_MAX)),
    other: round2(otherDeductions),
  };
  const total = round2(Object.values(lines).reduce((a, b) => a + b, 0));
  return { lines, total };
}

// Share of the next dollar that goes to withholding at this weekly gross.
export function marginalRate(gross, opts) {
  const a = weeklyWithholding(gross, opts).total;
  const b = weeklyWithholding(gross + 100, opts).total;
  return (b - a) / 100;
}
