import assert from 'node:assert/strict';
import { certificateDesign, renderCertificatePdf, snapshotFromRecord, type CertificateSnapshot } from './certificate-renderer';

async function run() {
  const design = certificateDesign({ renderMode: 'DESIGN', theme: 'ACADEMIC', title: 'Merit Award', achievementLine: 'For first place in the science exhibition', signatoryName: 'Principal', signatoryTitle: 'School principal' }, 'Fallback');
  assert.equal(design.theme, 'ACADEMIC');
  assert.equal(design.title, 'Merit Award');
  const snapshot: CertificateSnapshot = { studentName: 'Sample Student', gradeName: 'Grade 10', branchName: 'Main Branch', institutionName: 'Sample Academy', templateName: 'Science Award', templateType: 'ACHIEVEMENT', templateVersion: 1, issuedDate: '09/09/2026', certificateId: 'CERT-2026-TEST', design };
  const pdf = await renderCertificatePdf(snapshot);
  assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
  assert.ok(pdf.length > 1000);
  const persisted = snapshotFromRecord({ snapshot, student: { user: { firstName: 'Changed', lastName: 'Name' }, grade: { name: 'Changed grade' } }, branch: { name: 'Changed branch' }, template: { name: 'Changed template', type: 'CUSTOM' }, issuedDate: new Date() });
  assert.equal(persisted.studentName, 'Sample Student');
  assert.equal(persisted.templateName, 'Science Award');
  const fallback = certificateDesign({ renderMode: 'DESIGN', theme: 'UNKNOWN' }, 'Completion');
  assert.equal(fallback.theme, 'CLASSIC');
  assert.equal(fallback.title, 'Completion');
  console.log('PASS structured certificate designs render as stable PDF documents');
}

void run();
