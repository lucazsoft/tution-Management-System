import { useMemo, useRef, useState } from 'react';
import { Button } from './ui/Button';
import { StatusBadge } from './ui/StatusBadge';
import { useToast } from './ui/Toast';
import { api } from '../services/api';
import { parseBsDateString } from '../utils/nepaliDate';

interface BulkStudentImportProps {
  branches: Array<{ id: string; name: string }>;
  grades?: Array<{ id: string; name: string; billingMode?: 'GRADE' | 'SUBJECT' }>;
  onClose: () => void;
  onImported: () => void;
}

interface Column {
  header: string;
  key: string;
  required?: boolean;
  /** Shown in the downloaded template's guidance row. */
  hint?: string;
}

// Mirrors BULK_ADMISSION_FIELDS on the API. The required set is exactly the
// admission form's required set — anything optional here stays editable in the
// student's profile after import.
const COLUMNS: Column[] = [
  { header: 'First Name', key: 'firstName', required: true },
  { header: 'Last Name', key: 'lastName', required: true },
  { header: 'Email', key: 'email', required: true, hint: 'Student login ID' },
  { header: 'Phone', key: 'phone', required: true, hint: 'Receives the login SMS' },
  { header: 'Admission Date (BS)', key: 'admissionDateBs', required: true, hint: 'Bikram Sambat, YYYY-MM-DD' },
  { header: 'Admission Time', key: 'admissionTime', hint: 'Nepal time HH:mm, defaults to 10:00' },
  { header: 'Fee Already Paid', key: 'feeAlreadyPaid', required: true, hint: 'yes for students who already paid' },
  { header: 'Branch', key: 'branchName', hint: 'Must match a branch name' },
  { header: 'Grade', key: 'gradeName', required: true, hint: 'Must match a grade name' },
  { header: 'Subjects', key: 'subjects', hint: 'Class 11-12 only, e.g. Physics;Chemistry' },
  { header: 'Date of Birth (BS)', key: 'dateOfBirthBs', required: true, hint: 'Bikram Sambat, YYYY-MM-DD' },
  { header: 'Gender', key: 'gender', required: true, hint: 'Male, Female, or Other' },
  { header: 'Blood Group', key: 'bloodGroup' },
  { header: 'Nationality', key: 'nationality', hint: 'Defaults to Nepali' },
  { header: 'Permanent Address', key: 'permanentAddress', required: true },
  { header: 'Temporary Address', key: 'temporaryAddress' },
  { header: 'School', key: 'school' },
  { header: 'Medical Notes', key: 'medicalNotes' },
  { header: 'Father Name', key: 'fatherName', required: true },
  { header: 'Father Phone', key: 'fatherPhone', required: true },
  { header: 'Father Email', key: 'fatherEmail', hint: 'Required if Primary Parent is Father' },
  { header: 'Father Occupation', key: 'fatherOccupation' },
  { header: 'Mother Name', key: 'motherName', required: true },
  { header: 'Mother Phone', key: 'motherPhone', required: true },
  { header: 'Mother Email', key: 'motherEmail', hint: 'Required if Primary Parent is Mother' },
  { header: 'Mother Occupation', key: 'motherOccupation' },
  { header: 'Optional Parent Name', key: 'optionalParentName' },
  { header: 'Optional Parent Phone', key: 'optionalParentPhone' },
  { header: 'Optional Parent Email', key: 'optionalParentEmail' },
  { header: 'Optional Parent Occupation', key: 'optionalParentOccupation' },
  { header: 'Optional Parent Relationship', key: 'optionalParentRelationship' },
  { header: 'Primary Parent', key: 'primaryParent', required: true, hint: 'Father, Mother, or Optional parent' },
  { header: 'Emergency Contact Name', key: 'emergencyContactName', required: true },
  { header: 'Emergency Contact Phone', key: 'emergencyContactPhone', required: true },
  { header: 'Emergency Contact Relationship', key: 'emergencyContactRelationship', required: true },
];

const ROW_LIMIT = 200;
const BS_DATE_KEYS = ['admissionDateBs', 'dateOfBirthBs'] as const;

type RowRecord = Record<string, string>;

interface ImportResult {
  row: number;
  name: string;
  email: string;
  status: 'created' | 'error';
  admissionNumber?: string;
  admissionDateBs?: string;
  admissionStatus?: string;
  admissionFee?: number;
  feeSettled?: boolean;
  tenureYear?: number;
  loginsSent?: boolean;
  warning?: string;
  error?: string;
}

const csvCell = (value: string) => `"${value.replace(/"/g, '""')}"`;

/**
 * Split one CSV line, honouring quoted fields. Addresses routinely contain
 * commas ("Damak-5, Jhapa"), so splitting on the delimiter alone silently
 * shifts every later column of the row.
 */
function splitCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (quoted) {
      if (char === '"') {
        if (line[i + 1] === '"') { current += '"'; i++; } else { quoted = false; }
      } else current += char;
    } else if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      cells.push(current); current = '';
    } else current += char;
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
}

/** Rows may span lines when a quoted cell contains a newline. */
function splitCsvRows(text: string): string[] {
  const rows: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') { quoted = !quoted; current += char; continue; }
    if (!quoted && (char === '\n' || char === '\r')) {
      if (char === '\r' && text[i + 1] === '\n') i++;
      if (current.trim()) rows.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim()) rows.push(current);
  return rows;
}

export function BulkStudentImport({ branches, grades = [], onClose, onImported }: BulkStudentImportProps) {
  const { showToast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<RowRecord[]>([]);
  const [fileName, setFileName] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [results, setResults] = useState<ImportResult[] | null>(null);

  const subjectGrades = grades.filter((grade) => grade.billingMode === 'SUBJECT').map((grade) => grade.name);

  const downloadTemplate = () => {
    const sampleGrade = grades.find((grade) => grade.billingMode !== 'SUBJECT')?.name ?? grades[0]?.name ?? 'Class 10';
    const sample: RowRecord = {
      firstName: 'Aarav', lastName: 'Koirala',
      email: 'aarav.koirala@example.com', phone: '9800000001',
      admissionDateBs: '2080-03-15', admissionTime: '10:00', feeAlreadyPaid: 'yes',
      branchName: branches[0]?.name ?? 'Damak Main Center', gradeName: sampleGrade, subjects: '',
      dateOfBirthBs: '2065-05-10', gender: 'Male', bloodGroup: 'O+', nationality: 'Nepali',
      permanentAddress: 'Damak-5, Jhapa, Koshi', temporaryAddress: '', school: 'Shree Secondary School', medicalNotes: '',
      fatherName: 'Rajesh Koirala', fatherPhone: '9800000002', fatherEmail: 'rajesh.koirala@example.com', fatherOccupation: 'Teacher',
      motherName: 'Sita Koirala', motherPhone: '9800000003', motherEmail: '', motherOccupation: 'Businessperson',
      optionalParentName: '', optionalParentPhone: '', optionalParentEmail: '', optionalParentOccupation: '', optionalParentRelationship: '',
      primaryParent: 'Father',
      emergencyContactName: 'Hari Koirala', emergencyContactPhone: '9800000004', emergencyContactRelationship: 'Uncle',
    };

    const csv = [
      COLUMNS.map((column) => csvCell(column.header)).join(','),
      COLUMNS.map((column) => csvCell(sample[column.key] ?? '')).join(','),
      // A guidance row the admin deletes before uploading; a row whose every
      // cell starts with "#" is skipped on parse so an oversight is harmless.
      COLUMNS.map((column) => csvCell(`# ${column.required ? 'Required. ' : ''}${column.hint ?? ''}`.trim())).join(','),
    ].join('\r\n');

    // The BOM keeps Devanagari and Nepali names readable when Excel opens it.
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'tms-admission-import-template.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleFile = async (file: File) => {
    setIsParsing(true);
    setResults(null);
    try {
      const text = (await file.text()).replace(/^﻿/, '');
      const lines = splitCsvRows(text);
      if (lines.length < 2) throw new Error('The file has a header but no student rows.');

      const delimiter = lines[0].includes('\t') && !lines[0].includes(',') ? '\t' : ',';
      const headers = splitCsvLine(lines[0], delimiter).map((header) => header.toLowerCase());
      const headerMap = new Map<string, number>();
      COLUMNS.forEach((column) => {
        const index = headers.indexOf(column.header.toLowerCase());
        if (index !== -1) headerMap.set(column.key, index);
      });

      const missing = COLUMNS.filter((column) => column.required && !headerMap.has(column.key)).map((column) => column.header);
      if (missing.length) {
        throw new Error(`The file is missing required columns: ${missing.join(', ')}. Download the template to get the exact headers.`);
      }

      const parsed: RowRecord[] = [];
      for (let i = 1; i < lines.length; i++) {
        const cells = splitCsvLine(lines[i], delimiter);
        if (cells.every((cell) => !cell || cell.startsWith('#'))) continue; // guidance row
        const record: RowRecord = {};
        let hasValue = false;
        COLUMNS.forEach((column) => {
          const index = headerMap.get(column.key);
          const value = index !== undefined ? cells[index] ?? '' : '';
          record[column.key] = value;
          if (value) hasValue = true;
        });
        if (hasValue) parsed.push(record);
      }

      if (!parsed.length) throw new Error('No student rows were found below the header.');
      if (parsed.length > ROW_LIMIT) {
        throw new Error(`This file has ${parsed.length} rows. Import at most ${ROW_LIMIT} at a time so the login SMS messages are not rate-limited.`);
      }
      setRows(parsed);
      setFileName(file.name);
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : 'Could not read the file.', 'error');
      setRows([]);
      setFileName('');
    } finally {
      setIsParsing(false);
    }
  };

  // Catch what can be checked without the server, so an admin fixes the
  // spreadsheet in one pass instead of discovering problems row by row.
  const preflight = useMemo(() => rows.map((row) => {
    const problems: string[] = [];
    const missing = COLUMNS
      .filter((column) => column.required && column.key !== 'branchName' && !row[column.key])
      .map((column) => column.header);
    if (missing.length) problems.push(`Missing ${missing.join(', ')}`);
    if (!row.branchName && branches.length > 1) problems.push('Branch is required when the institution has more than one branch');

    BS_DATE_KEYS.forEach((key) => {
      const value = row[key];
      if (value && !parseBsDateString(value)) {
        problems.push(`"${value}" is not a real ${key === 'admissionDateBs' ? 'admission' : 'date of birth'} BS date`);
      }
    });

    const feePaid = (row.feeAlreadyPaid ?? '').toLowerCase();
    if (feePaid && !['yes', 'y', 'true', '1', 'paid', 'no', 'n', 'false', '0', 'unpaid', 'due'].includes(feePaid)) {
      problems.push('Fee Already Paid must be yes or no');
    }

    const primary = row.primaryParent ?? '';
    if (primary && !['Father', 'Mother', 'Optional parent'].includes(primary)) {
      problems.push('Primary Parent must be Father, Mother, or Optional parent');
    } else if (primary) {
      const emailKey = primary === 'Father' ? 'fatherEmail' : primary === 'Mother' ? 'motherEmail' : 'optionalParentEmail';
      if (!row[emailKey]) problems.push(`${primary} is the primary parent, so their email is required`);
    }

    if (row.email && row.email.trim().toLowerCase() === (row[primary === 'Mother' ? 'motherEmail' : primary === 'Optional parent' ? 'optionalParentEmail' : 'fatherEmail'] ?? '').trim().toLowerCase()) {
      problems.push('The student and the primary parent need different email addresses');
    }

    return problems;
  }), [rows, branches.length]);

  const blockedRows = preflight.filter((problems) => problems.length).length;
  const settledRows = rows.filter((row) => ['yes', 'y', 'true', '1', 'paid'].includes((row.feeAlreadyPaid ?? '').toLowerCase())).length;

  const submit = async () => {
    if (!rows.length || blockedRows) return;
    setIsImporting(true);
    try {
      const response = await api.people.bulkAdmitStudents(rows);
      setResults(response.results);
      showToast(
        `${response.createdCount} admitted, ${response.errorCount} skipped.`,
        response.errorCount === 0 ? 'success' : 'info',
      );
      if (response.createdCount > 0) onImported();
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : 'Import failed.', 'error');
    } finally {
      setIsImporting(false);
    }
  };

  const downloadReport = () => {
    if (!results) return;
    const lines = [
      ['Row', 'Student', 'Email', 'Result', 'Admission Number', 'Admission Date (BS)', 'Admission Status', 'Fee Settled', 'Admission Year', 'Logins Sent', 'Note']
        .map(csvCell).join(','),
    ];
    results.forEach((result) => {
      lines.push([
        String(result.row),
        result.name,
        result.email,
        result.status === 'created' ? 'Admitted' : 'Skipped',
        result.admissionNumber ?? '',
        result.admissionDateBs ?? '',
        result.admissionStatus ?? '',
        result.status === 'created' ? (result.feeSettled ? 'Yes' : 'No') : '',
        result.tenureYear ? String(result.tenureYear) : '',
        result.status === 'created' ? (result.loginsSent ? 'Yes' : 'No') : '',
        result.error ?? result.warning ?? '',
      ].map(csvCell).join(','));
    });

    const blob = new Blob([`﻿${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'admission-import-report.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const createdCount = results?.filter((result) => result.status === 'created').length ?? 0;
  const skippedCount = (results?.length ?? 0) - createdCount;

  return (
    <>
      <div className="people-drawer-overlay" onClick={onClose} />
      <aside className="people-drawer" role="dialog" aria-modal="true" style={{ width: 'min(680px, 100vw)' }}>
        <div className="people-drawer-head">
          <div>
            <h2>Bulk Admission Import</h2>
            <p>Each row is a full admission: admission number, admission record, invoice, and login SMS — the same as the admission form.</p>
          </div>
          <button type="button" className="people-drawer-close" onClick={onClose} aria-label="Close">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="people-drawer-body">
          {!results ? (
            <>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <Button variant="outline" onClick={downloadTemplate} style={{ flex: 1, minWidth: '200px' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>download</span>
                  Download CSV Template
                </Button>
                <Button onClick={() => fileRef.current?.click()} disabled={isParsing} style={{ flex: 1, minWidth: '160px' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>upload_file</span>
                  {isParsing ? 'Reading…' : 'Choose File'}
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values"
                  style={{ display: 'none' }}
                  onChange={(event) => { const file = event.target.files?.[0]; if (file) void handleFile(file); event.target.value = ''; }}
                />
              </div>

              <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', lineHeight: 1.7 }}>
                <p style={{ margin: '0 0 8px' }}>
                  <strong>Dates are Bikram Sambat</strong>, written as <code>YYYY-MM-DD</code> — <code>2080-03-15</code> is Asar 15, 2080.
                  Both the admission date and the date of birth use BS, and the preview shows the AD date each one converts to.
                </p>
                <p style={{ margin: '0 0 8px' }}>
                  <strong>Fee Already Paid = yes</strong> is for students admitted before the system went live. Their admission fee is
                  recorded as settled on the admission date, they become active straight away, and their login IDs are sent by SMS.
                  Leave it <strong>no</strong> for a new admission: the branch fee is invoiced and logins follow the payment.
                </p>
                <p style={{ margin: 0 }}>
                  {subjectGrades.length
                    ? <>Fill <strong>Subjects</strong> only for subject-billed grades ({subjectGrades.join(', ')}), separated by semicolons. Every other grade is admitted at grade level.</>
                    : <>Leave <strong>Subjects</strong> empty — every grade here is billed at grade level.</>}
                  {' '}Occupations, school, blood group, medical notes, and the optional guardian can be left blank and edited in the student&apos;s profile later.
                </p>
              </div>

              {rows.length > 0 ? (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: '8px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700 }}>{fileName} — {rows.length} student{rows.length === 1 ? '' : 's'}</span>
                    <span style={{ display: 'flex', gap: 6 }}>
                      {blockedRows
                        ? <StatusBadge variant="error">{blockedRows} need{blockedRows === 1 ? 's' : ''} fixing</StatusBadge>
                        : <StatusBadge variant="success">Ready</StatusBadge>}
                      {settledRows ? <StatusBadge variant="info">{settledRows} already paid</StatusBadge> : null}
                    </span>
                  </div>
                  <div className="people-table-wrap">
                    <div className="people-table-scroll" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                      <table className="people-table" style={{ minWidth: '600px' }}>
                        <thead>
                          <tr><th>#</th><th>Student</th><th>Grade</th><th>Admitted (BS)</th><th>Fee</th><th>Check</th></tr>
                        </thead>
                        <tbody>
                          {rows.map((row, index) => {
                            const problems = preflight[index];
                            const admitted = parseBsDateString(row.admissionDateBs ?? '');
                            return (
                              <tr key={index}>
                                <td style={{ color: 'var(--text-muted)' }}>{index + 1}</td>
                                <td>
                                  <div style={{ fontWeight: 600 }}>{`${row.firstName ?? ''} ${row.lastName ?? ''}`.trim() || '—'}</div>
                                  <div className="people-person-email">{row.email || '—'}</div>
                                </td>
                                <td style={{ fontSize: '12.5px' }}>
                                  {row.gradeName || '—'}
                                  {row.subjects ? <div style={{ color: 'var(--text-muted)', fontSize: '11.5px' }}>{row.subjects.split(';').filter(Boolean).join(', ')}</div> : null}
                                </td>
                                <td style={{ fontSize: '12.5px' }}>
                                  {row.admissionDateBs || '—'}
                                  {admitted ? <div style={{ color: 'var(--text-muted)', fontSize: '11.5px' }}>{admitted.adKey} AD</div> : null}
                                </td>
                                <td style={{ fontSize: '12.5px' }}>
                                  {['yes', 'y', 'true', '1', 'paid'].includes((row.feeAlreadyPaid ?? '').toLowerCase()) ? 'Already paid' : 'Due now'}
                                </td>
                                <td style={{ fontSize: '11.5px' }}>
                                  {problems.length
                                    ? <span style={{ color: 'var(--color-error)' }}>{problems.join('. ')}</span>
                                    : <span style={{ color: 'var(--text-muted)' }}>OK</span>}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  {blockedRows ? (
                    <p role="alert" style={{ fontSize: '12.5px', color: 'var(--color-error)', marginTop: 8 }}>
                      Fix the {blockedRows} flagged row{blockedRows === 1 ? '' : 's'} in your spreadsheet and upload it again. Nothing is imported until every row passes.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : (
            <>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <StatusBadge variant="success">{createdCount} admitted</StatusBadge>
                {skippedCount ? <StatusBadge variant="error">{skippedCount} skipped</StatusBadge> : null}
              </div>
              <div className="people-table-wrap">
                <div className="people-table-scroll" style={{ maxHeight: '380px', overflowY: 'auto' }}>
                  <table className="people-table" style={{ minWidth: '560px' }}>
                    <thead>
                      <tr><th>#</th><th>Student</th><th>Result</th></tr>
                    </thead>
                    <tbody>
                      {results.map((result) => (
                        <tr key={result.row}>
                          <td style={{ color: 'var(--text-muted)' }}>{result.row}</td>
                          <td>
                            <div style={{ fontWeight: 600 }}>{result.name || result.email}</div>
                            <div className="people-person-email">{result.email}</div>
                          </td>
                          <td>
                            {result.status === 'created' ? (
                              <div>
                                <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                  <StatusBadge variant={result.admissionStatus === 'ACTIVE' ? 'success' : 'warning'}>
                                    {result.admissionStatus === 'ACTIVE' ? 'Active' : 'Payment pending'}
                                  </StatusBadge>
                                  {result.loginsSent ? <StatusBadge variant="info">Logins sent</StatusBadge> : null}
                                </span>
                                <div style={{ fontFamily: 'monospace', fontSize: '12px', marginTop: '4px', color: 'var(--color-primary-light)' }}>
                                  {result.admissionNumber}
                                </div>
                                <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                  Admitted {result.admissionDateBs} BS
                                  {result.tenureYear && result.tenureYear > 1 ? ` · admission year ${result.tenureYear}` : ''}
                                  {result.feeSettled ? ' · fee settled' : ` · NPR ${Number(result.admissionFee ?? 0).toLocaleString('en-NP')} due`}
                                </div>
                                {result.warning ? <div style={{ fontSize: '11px', color: 'var(--color-warning)', marginTop: '2px' }}>{result.warning}</div> : null}
                              </div>
                            ) : (
                              <div>
                                <StatusBadge variant="error">Skipped</StatusBadge>
                                <div style={{ fontSize: '11.5px', color: 'var(--color-error)', marginTop: '2px' }}>{result.error}</div>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Temporary passwords are never shown here — they go straight to the student and parent phone numbers by SMS, exactly as
                they do for a walk-in admission. Students still owing the admission fee receive theirs once the invoice is paid.
              </p>
            </>
          )}
        </div>

        <div className="people-drawer-foot">
          {!results ? (
            <>
              <Button onClick={() => void submit()} disabled={rows.length === 0 || isImporting || blockedRows > 0} style={{ flex: 1 }}>
                {isImporting ? 'Admitting…' : `Admit ${rows.length || ''} Student${rows.length === 1 ? '' : 's'}`}
              </Button>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
            </>
          ) : (
            <>
              <Button onClick={downloadReport} style={{ flex: 1 }}>
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>download</span>
                Download Import Report
              </Button>
              <Button variant="outline" onClick={onClose}>Done</Button>
            </>
          )}
        </div>
      </aside>
    </>
  );
}
