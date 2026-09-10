import PDFDocument from 'pdfkit';

export type LedgerSource = 'INVOICE' | 'EXPENSE' | 'PAYROLL';

export interface LedgerLine {
  account: string;
  debitPaisa: number;
  creditPaisa: number;
}

export interface JournalEntry {
  date: Date;
  memo: string;
  source: LedgerSource;
  sourceId: string;
  branchId?: string | null;
  lines: LedgerLine[];
}

export interface LedgerValidation {
  balanced: boolean;
  totalDebitPaisa: number;
  totalCreditPaisa: number;
}

/** Deterministic NPR → paisa conversion. All ledger math runs on integers. */
export function toPaisa(npr: number | string | { toString(): string }): number {
  const value = Number(npr?.toString() ?? NaN);
  if (!Number.isFinite(value) || value <= 0 || value > 100_000_000) {
    throw new Error('Amount must be a positive finite number up to 100,000,000 NPR.');
  }
  return Math.round(value * 100);
}

export function validateJournalEntry(entry: JournalEntry): LedgerValidation {
  if (!entry || !Array.isArray(entry.lines) || entry.lines.length < 2) {
    throw new Error('A journal entry requires at least two lines.');
  }
  let totalDebitPaisa = 0;
  let totalCreditPaisa = 0;
  for (const line of entry.lines) {
    if (!line || typeof line.account !== 'string' || !line.account.trim()) {
      throw new Error('Every journal line requires a non-empty account name.');
    }
    const debit = line.debitPaisa ?? 0;
    const credit = line.creditPaisa ?? 0;
    if (!Number.isInteger(debit) || !Number.isInteger(credit) || debit < 0 || credit < 0) {
      throw new Error(`Invalid amounts on account "${line.account}".`);
    }
    const hasDebit = debit > 0;
    const hasCredit = credit > 0;
    if (hasDebit === hasCredit) {
      throw new Error(`Line "${line.account}" must carry exactly one of debit or credit.`);
    }
    totalDebitPaisa += debit;
    totalCreditPaisa += credit;
  }
  if (totalDebitPaisa <= 0 || totalDebitPaisa !== totalCreditPaisa) {
    throw new Error(
      `Journal entry ${entry.sourceId} is out of balance: debits ${totalDebitPaisa} != credits ${totalCreditPaisa}.`,
    );
  }
  return { balanced: true, totalDebitPaisa, totalCreditPaisa };
}

function makeEntry(input: Omit<JournalEntry, 'lines'> & { debitAccount: string; creditAccount: string; amountPaisa: number }): JournalEntry {
  const entry: JournalEntry = {
    date: input.date,
    memo: input.memo,
    source: input.source,
    sourceId: input.sourceId,
    branchId: input.branchId ?? null,
    lines: [
      { account: input.debitAccount, debitPaisa: input.amountPaisa, creditPaisa: 0 },
      { account: input.creditAccount, debitPaisa: 0, creditPaisa: input.amountPaisa },
    ],
  };
  validateJournalEntry(entry);
  return entry;
}

interface InvoiceLike {
  id: string;
  invoiceType: string;
  netPayable: number | string | { toString(): string };
  paymentDate?: Date | null;
  updatedAt: Date;
  branchId?: string | null;
}

export function invoiceToEntry(invoice: InvoiceLike): JournalEntry {
  return makeEntry({
    date: invoice.paymentDate ?? invoice.updatedAt,
    memo: `Payment for invoice ${invoice.id}`,
    source: 'INVOICE',
    sourceId: invoice.id,
    branchId: invoice.branchId ?? null,
    debitAccount: 'Cash/Bank Account',
    creditAccount: `${invoice.invoiceType} Income`,
    amountPaisa: toPaisa(invoice.netPayable),
  });
}

interface ExpenseLike {
  id: string;
  category: string;
  amount: number | string | { toString(): string };
  purpose: string;
  date: Date;
  branchId?: string | null;
}

export function expenseToEntry(expense: ExpenseLike): JournalEntry {
  return makeEntry({
    date: expense.date,
    memo: expense.purpose,
    source: 'EXPENSE',
    sourceId: expense.id,
    branchId: expense.branchId ?? null,
    debitAccount: `${expense.category} Expense`,
    creditAccount: 'Cash/Bank Account',
    amountPaisa: toPaisa(expense.amount),
  });
}

interface PayrollLike {
  id: string;
  month: number;
  year: number;
  netPayable: number | string | { toString(): string };
  paymentDate?: Date | null;
  updatedAt: Date;
  branchId?: string | null;
}

export function payrollToEntry(payroll: PayrollLike): JournalEntry {
  return makeEntry({
    date: payroll.paymentDate ?? payroll.updatedAt,
    memo: `Payroll ${payroll.month}/${payroll.year}`,
    source: 'PAYROLL',
    sourceId: payroll.id,
    branchId: payroll.branchId ?? null,
    debitAccount: 'Payroll Expense',
    creditAccount: 'Cash/Bank Account',
    amountPaisa: toPaisa(payroll.netPayable),
  });
}

export interface BuiltLedger {
  entries: JournalEntry[];
  entryCount: number;
  totalDebitPaisa: number;
  totalCreditPaisa: number;
  balanced: boolean;
}

/** Validate every entry, then sort deterministically by date then source id. */
export function buildLedger(entries: JournalEntry[]): BuiltLedger {
  const validated = entries.map((entry) => {
    validateJournalEntry(entry);
    return entry;
  });
  validated.sort((a, b) => a.date.getTime() - b.date.getTime() || (a.sourceId < b.sourceId ? -1 : 1));
  let totalDebitPaisa = 0;
  let totalCreditPaisa = 0;
  for (const entry of validated) {
    for (const line of entry.lines) {
      totalDebitPaisa += line.debitPaisa;
      totalCreditPaisa += line.creditPaisa;
    }
  }
  return {
    entries: validated,
    entryCount: validated.length,
    totalDebitPaisa,
    totalCreditPaisa,
    balanced: totalDebitPaisa === totalCreditPaisa,
  };
}

export interface TrialBalance {
  balanced: boolean;
  totalDebitPaisa: number;
  totalCreditPaisa: number;
  accounts: Record<string, { debitPaisa: number; creditPaisa: number }>;
}

export function trialBalance(entries: JournalEntry[]): TrialBalance {
  const accounts: TrialBalance['accounts'] = {};
  let totalDebitPaisa = 0;
  let totalCreditPaisa = 0;
  for (const entry of entries) {
    validateJournalEntry(entry);
    for (const line of entry.lines) {
      const account = (accounts[line.account] ??= { debitPaisa: 0, creditPaisa: 0 });
      account.debitPaisa += line.debitPaisa;
      account.creditPaisa += line.creditPaisa;
      totalDebitPaisa += line.debitPaisa;
      totalCreditPaisa += line.creditPaisa;
    }
  }
  return { balanced: totalDebitPaisa === totalCreditPaisa, totalDebitPaisa, totalCreditPaisa, accounts };
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function entryDebit(entry: JournalEntry): LedgerLine {
  return entry.lines.find((line) => line.debitPaisa > 0)!;
}

function entryCredit(entry: JournalEntry): LedgerLine {
  return entry.lines.find((line) => line.creditPaisa > 0)!;
}

export function formatNpr(paisa: number): string {
  return (paisa / 100).toFixed(2);
}

/** Deterministic CSV export: header + one row per journal entry + totals row. */
export function toLedgerCsv(entries: JournalEntry[]): string {
  const ledger = buildLedger(entries);
  const rows = ['Date,Debit Account,Credit Account,Amount (NPR),Description'];
  for (const entry of ledger.entries) {
    const debit = entryDebit(entry);
    const credit = entryCredit(entry);
    rows.push(
      [
        csvCell(entry.date.toISOString()),
        csvCell(debit.account),
        csvCell(credit.account),
        csvCell(formatNpr(debit.debitPaisa)),
        csvCell(`${entry.memo} [${entry.source}:${entry.sourceId}]`),
      ].join(','),
    );
  }
  rows.push(`TOTAL,,,${formatNpr(ledger.totalDebitPaisa)},`);
  return `${rows.join('\n')}\n`;
}

/** Minimal audit-friendly PDF export rendered with pdfkit. */
export function renderLedgerPdf(entries: JournalEntry[], tenantId: string): Promise<Buffer> {
  const ledger = buildLedger(entries);
  return new Promise((resolve, reject) => {
    const document = new PDFDocument({
      size: 'A4',
      margin: 48,
      info: { Title: 'General Ledger Export', Author: tenantId, Subject: 'Double-entry general ledger' },
    });
    const chunks: Buffer[] = [];
    document.on('data', (chunk: Buffer) => chunks.push(chunk));
    document.on('end', () => resolve(Buffer.concat(chunks)));
    document.on('error', reject);
    document.fontSize(16).text('General Ledger Export', { underline: true });
    document.moveDown(0.5);
    document.fontSize(10).text(`Entries: ${ledger.entryCount}   Total debits: NPR ${formatNpr(ledger.totalDebitPaisa)}   Total credits: NPR ${formatNpr(ledger.totalCreditPaisa)}   Balanced: ${ledger.balanced ? 'YES' : 'NO'}`);
    document.moveDown(0.5);
    document.fontSize(9);
    for (const entry of ledger.entries) {
      const debit = entryDebit(entry);
      const credit = entryCredit(entry);
      document.text(
        `${entry.date.toISOString().slice(0, 10)} | Dr ${debit.account} | Cr ${credit.account} | NPR ${formatNpr(debit.debitPaisa)} | ${entry.memo} [${entry.source}:${entry.sourceId}]`,
      );
    }
    document.end();
  });
}
