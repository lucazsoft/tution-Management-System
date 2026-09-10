import assert from 'node:assert/strict';
import {
  buildLedger,
  expenseToEntry,
  invoiceToEntry,
  payrollToEntry,
  toLedgerCsv,
  trialBalance,
  validateJournalEntry,
  type JournalEntry,
} from './general-ledger';

function entry(overrides: Partial<JournalEntry> = {}): JournalEntry {
  return {
    date: new Date('2026-08-10T00:00:00Z'),
    memo: 'Test memo',
    source: 'INVOICE',
    sourceId: 'inv-1',
    lines: [
      { account: 'Cash/Bank Account', debitPaisa: 10000, creditPaisa: 0 },
      { account: 'TUITION Income', debitPaisa: 0, creditPaisa: 10000 },
    ],
    ...overrides,
  };
}

async function main() {
  // Balanced entry passes and reports equality.
  const ok = validateJournalEntry(entry());
  assert.equal(ok.balanced, true);
  assert.equal(ok.totalDebitPaisa, 10000);
  assert.equal(ok.totalCreditPaisa, 10000);

  // Unbalanced entry is rejected.
  assert.throws(
    () =>
      validateJournalEntry(
        entry({
          lines: [
            { account: 'Cash/Bank Account', debitPaisa: 10000, creditPaisa: 0 },
            { account: 'TUITION Income', debitPaisa: 0, creditPaisa: 9999 },
          ],
        }),
      ),
    /balance/i,
  );

  // Single-line and empty-account entries are rejected.
  assert.throws(() => validateJournalEntry(entry({ lines: [entry().lines[0]] })), /at least two/i);
  assert.throws(
    () =>
      validateJournalEntry(
        entry({ lines: [{ account: '  ', debitPaisa: 100, creditPaisa: 0 }, entry().lines[1]] }),
      ),
    /account/i,
  );

  // A line with both debit and credit (or neither) is rejected.
  assert.throws(
    () =>
      validateJournalEntry(
        entry({
          lines: [
            { account: 'Cash/Bank Account', debitPaisa: 100, creditPaisa: 100 },
            { account: 'TUITION Income', debitPaisa: 0, creditPaisa: 10000 },
          ],
        }),
      ),
    /exactly one/i,
  );

  // Domain mappings produce balanced double-entry postings with deterministic paisa math.
  const invoiceEntry = invoiceToEntry({
    id: 'inv-1',
    invoiceType: 'TUITION',
    netPayable: 100.555,
    paymentDate: new Date('2026-08-10T00:00:00Z'),
    updatedAt: new Date('2026-08-10T00:00:00Z'),
  });
  assert.equal(invoiceEntry.lines[0].debitPaisa, 10056);
  assert.equal(invoiceEntry.lines[1].creditPaisa, 10056);

  const expenseEntry = expenseToEntry({
    id: 'exp-1',
    category: 'RENT',
    amount: 50.25,
    purpose: 'Office rent',
    date: new Date('2026-08-11T00:00:00Z'),
  });
  assert.equal(expenseEntry.lines[0].account, 'RENT Expense');

  const payrollEntry = payrollToEntry({
    id: 'pay-1',
    month: 8,
    year: 2026,
    netPayable: 200,
    paymentDate: new Date('2026-08-12T00:00:00Z'),
    updatedAt: new Date('2026-08-12T00:00:00Z'),
  });
  assert.equal(payrollEntry.lines[1].account, 'Cash/Bank Account');

  // buildLedger sorts deterministically and trial balance nets to zero.
  const ledger = buildLedger([payrollEntry, invoiceEntry, expenseEntry]);
  assert.equal(ledger.entries[0].sourceId, 'inv-1');
  const balance = trialBalance(ledger.entries);
  assert.equal(balance.balanced, true);
  assert.equal(balance.totalDebitPaisa, balance.totalCreditPaisa);

  // CSV export is deterministic: header + sorted rows + totals row.
  const csv = toLedgerCsv(ledger.entries);
  const rows = csv.trim().split('\n');
  assert.equal(rows[0], 'Date,Debit Account,Credit Account,Amount (NPR),Description');
  assert.ok(rows[1].includes('inv-1'));
  assert.ok(rows[rows.length - 1].startsWith('TOTAL,,,'));

  console.log('PASS general ledger engine balances debits and credits deterministically');
}

void main();
