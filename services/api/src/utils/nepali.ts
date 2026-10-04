// Bikram Sambat (Nepali) billing helpers.
//
// nepali-date-library ships a broken CommonJS build (empty exports), but a
// correct ESM build. Because this service compiles to CommonJS, a normal
// import/require would hit the broken build — so we load the ESM module via a
// Function-wrapped dynamic import (which TypeScript does NOT downlevel to
// require) and cache it.

interface NepaliLib {
  NepaliDate: new (yearOrDate?: Date | number | string, month?: number, day?: number) => {
    year: number;
    month: number; // 0-indexed BS month
    day: number;
    getEnglishDate: () => Date;
  };
  ADtoBS: (adDate: string) => string;
  BStoAD: (bsDate: string) => string;
  MONTH_EN: string[];
  MONTH_NP: string[];
  NEPALI_DATE_MAP: Array<{ year: number; days: number[] }>;
}

const dynamicImport = new Function('m', 'return import(m)') as
  (m: string) => Promise<NepaliLib | { default: NepaliLib }>;
let cached: NepaliLib | null = null;

async function lib(): Promise<NepaliLib> {
  if (!cached) {
    const imported = await dynamicImport('nepali-date-library');
    cached = 'NepaliDate' in imported ? imported : imported.default;
  }
  return cached;
}

function atUtcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export interface BillingPeriod {
  bsYear: number;
  bsMonthIndex: number; // 0-indexed
  bsMonthName: string; // e.g. "Asar"
  bsMonthNameNp: string; // Devanagari
  label: string; // e.g. "Asar 2083"
  daysInMonth: number;
  cycleStart: Date; // AD, inclusive
  cycleEnd: Date; // AD, inclusive
  dueDate: Date; // AD
}

// The BS month that contains `ref`, with its AD boundaries and a due date
// `graceDays` after the cycle start.
export async function getBillingPeriod(ref: Date = new Date(), graceDays = 10): Promise<BillingPeriod> {
  const { NepaliDate, MONTH_EN, MONTH_NP, NEPALI_DATE_MAP } = await lib();

  const nd = new NepaliDate(atUtcMidnight(ref));
  const bsYear = nd.year;
  const bsMonthIndex = nd.month;

  const yearRow = NEPALI_DATE_MAP.find((r) => r.year === bsYear);
  const daysInMonth = yearRow ? yearRow.days[bsMonthIndex] : 30;

  const cycleStart = atUtcMidnight(new NepaliDate(bsYear, bsMonthIndex, 1).getEnglishDate());
  const cycleEnd = atUtcMidnight(new NepaliDate(bsYear, bsMonthIndex, daysInMonth).getEnglishDate());
  const dueDate = new Date(cycleStart);
  dueDate.setUTCDate(dueDate.getUTCDate() + graceDays);

  return {
    bsYear,
    bsMonthIndex,
    bsMonthName: MONTH_EN[bsMonthIndex],
    bsMonthNameNp: MONTH_NP[bsMonthIndex],
    label: `${MONTH_EN[bsMonthIndex]} ${bsYear}`,
    daysInMonth,
    cycleStart,
    cycleEnd,
    dueDate,
  };
}

// Format an AD date as a BS label, e.g. "Asar 29, 2083".
export async function formatBsDate(adDate: Date): Promise<string> {
  const { NepaliDate, MONTH_EN } = await lib();
  const nd = new NepaliDate(atUtcMidnight(adDate));
  return `${MONTH_EN[nd.month]} ${nd.day}, ${nd.year}`;
}

// Admission access starts on the payment date and lasts one complete Bikram
// Sambat year. The inclusive end is the day before the same BS date next year.
export async function getAdmissionTenure(paidAt: Date): Promise<{ start: Date; end: Date }> {
  const { NepaliDate, NEPALI_DATE_MAP } = await lib();
  const start = atUtcMidnight(paidAt);
  const paidBs = new NepaliDate(start);
  const nextYear = paidBs.year + 1;
  const daysInTargetMonth = NEPALI_DATE_MAP.find((row) => row.year === nextYear)?.days[paidBs.month] ?? 30;
  const anniversary = atUtcMidnight(new NepaliDate(nextYear, paidBs.month, Math.min(paidBs.day, daysInTargetMonth)).getEnglishDate());
  const end = new Date(anniversary);
  end.setUTCDate(end.getUTCDate() - 1);
  return { start, end };
}

export interface BsDateParts {
  year: number;
  monthIndex: number; // 0-indexed BS month
  day: number;
}

// Nepal Standard Time is a fixed UTC+05:45 — no daylight saving to account for.
const NPT_OFFSET_MINUTES = 5 * 60 + 45;

// Parse a `YYYY-MM-DD` Bikram Sambat date. BS months are 29-32 days and vary by
// year, so a day is only valid against that year's own month length.
export async function parseBsDate(value: string): Promise<BsDateParts | null> {
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) return null;

  const { NEPALI_DATE_MAP } = await lib();
  const yearRow = NEPALI_DATE_MAP.find((row) => row.year === year);
  if (!yearRow) return null; // Outside the calendar data the library ships.
  if (day > yearRow.days[month - 1]) return null;
  return { year, monthIndex: month - 1, day };
}

// The AD instant named by a BS date plus a Nepal-time wall clock (`HH:mm`).
// Returns null for anything the BS calendar or the clock does not allow, so
// callers can report a bad row instead of storing a silently shifted date.
export async function bsToAdInstant(bsDate: string, time = '00:00'): Promise<Date | null> {
  const parts = await parseBsDate(bsDate);
  if (!parts) return null;
  const clock = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!clock) return null;
  const hours = Number(clock[1]);
  const minutes = Number(clock[2]);
  if (hours > 23 || minutes > 59) return null;

  const { NepaliDate } = await lib();
  const midnight = atUtcMidnight(new NepaliDate(parts.year, parts.monthIndex, parts.day).getEnglishDate());
  return new Date(midnight.getTime() + (hours * 60 + minutes - NPT_OFFSET_MINUTES) * 60_000);
}

// Format an AD date as a machine-readable BS date, e.g. "2083-05-19".
export async function toBsDateString(adDate: Date): Promise<string> {
  const { NepaliDate } = await lib();
  const nd = new NepaliDate(atUtcMidnight(adDate));
  return `${nd.year}-${String(nd.month + 1).padStart(2, '0')}-${String(nd.day).padStart(2, '0')}`;
}

// The admission year that actually contains `ref`, counted in whole BS years
// from `admittedAt`. A student admitted in Shrawan 2080 is, in 2082, inside
// their third tenure year — so a backdated admission gets a live access window
// rather than one that expired two years ago.
export async function currentAdmissionTenure(
  admittedAt: Date,
  ref: Date = new Date(),
): Promise<{ start: Date; end: Date; yearsElapsed: number }> {
  const { NepaliDate, NEPALI_DATE_MAP } = await lib();
  const admitted = new NepaliDate(atUtcMidnight(admittedAt));
  const anchor = atUtcMidnight(ref);

  let tenure = await getAdmissionTenure(admittedAt);
  let yearsElapsed = 0;
  while (tenure.end < anchor) {
    const nextYear = admitted.year + yearsElapsed + 1;
    const yearRow = NEPALI_DATE_MAP.find((row) => row.year === nextYear);
    if (!yearRow) break; // Ran past the calendar data; keep the last known window.
    const daysInMonth = yearRow.days[admitted.month] ?? 30;
    const anniversary = atUtcMidnight(
      new NepaliDate(nextYear, admitted.month, Math.min(admitted.day, daysInMonth)).getEnglishDate(),
    );
    tenure = await getAdmissionTenure(anniversary);
    yearsElapsed += 1;
  }
  return { ...tenure, yearsElapsed };
}
