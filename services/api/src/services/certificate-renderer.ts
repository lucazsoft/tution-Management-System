import PDFDocument from 'pdfkit';

export type CertificateTheme = 'CLASSIC' | 'MODERN' | 'ACADEMIC';

export interface CertificateDesign {
  renderMode: 'DESIGN';
  theme: CertificateTheme;
  title: string;
  presentationLine: string;
  achievementLine: string;
  signatoryName: string;
  signatoryTitle: string;
}

export interface CertificateSnapshot {
  studentName: string;
  gradeName: string;
  branchName: string;
  institutionName: string;
  templateName: string;
  templateType: string;
  templateVersion: number;
  issuedDate: string;
  certificateId: string;
  design: CertificateDesign;
}

export function certificateDesign(value: unknown, fallbackTitle: string): CertificateDesign {
  const candidate = value && typeof value === 'object' ? value as Partial<CertificateDesign> : {};
  const clean = (input: unknown, fallback: string, max: number) => typeof input === 'string' && input.trim() ? input.trim().slice(0, max) : fallback;
  return {
    renderMode: 'DESIGN',
    theme: ['CLASSIC', 'MODERN', 'ACADEMIC'].includes(String(candidate.theme)) ? candidate.theme as CertificateTheme : 'CLASSIC',
    title: clean(candidate.title, fallbackTitle, 100),
    presentationLine: clean(candidate.presentationLine, 'This certificate is proudly presented to', 180),
    achievementLine: clean(candidate.achievementLine, 'In recognition of outstanding achievement', 240),
    signatoryName: clean(candidate.signatoryName, 'Authorized signatory', 100),
    signatoryTitle: clean(candidate.signatoryTitle, 'Institution representative', 100),
  };
}

const palette = (theme: CertificateTheme) => theme === 'MODERN'
  ? { primary: '#103B66', accent: '#2C7A7B', ink: '#17283A', soft: '#E8F3F3' }
  : theme === 'ACADEMIC'
    ? { primary: '#5A2348', accent: '#B48632', ink: '#2E1E2A', soft: '#F5EEDF' }
    : { primary: '#002D72', accent: '#B27B13', ink: '#1B1F3B', soft: '#EEF3F9' };

export function renderCertificatePdf(snapshot: CertificateSnapshot): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const document = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 0, info: { Title: snapshot.design.title, Author: snapshot.institutionName, Subject: snapshot.studentName } });
    document.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    document.on('end', () => resolve(Buffer.concat(chunks)));
    document.on('error', reject);
    const colors = palette(snapshot.design.theme);
    const width = document.page.width;
    const height = document.page.height;
    document.rect(0, 0, width, height).fill('#FFFFFF');
    document.rect(24, 24, width - 48, height - 48).lineWidth(4).stroke(colors.primary);
    document.rect(34, 34, width - 68, height - 68).lineWidth(1).stroke(colors.accent);
    document.rect(48, 48, width - 96, 58).fill(colors.soft);
    document.fillColor(colors.primary).font('Helvetica-Bold').fontSize(20).text(snapshot.institutionName, 70, 67, { width: width - 140, align: 'center' });
    document.fillColor(colors.accent).fontSize(11).text(snapshot.branchName.toUpperCase(), 70, 94, { width: width - 140, align: 'center', characterSpacing: 1.4 });
    document.fillColor(colors.primary).font('Times-Bold').fontSize(34).text(snapshot.design.title, 80, 140, { width: width - 160, align: 'center' });
    document.fillColor(colors.ink).font('Helvetica').fontSize(13).text(snapshot.design.presentationLine, 110, 205, { width: width - 220, align: 'center' });
    document.fillColor(colors.accent).font('Times-Bold').fontSize(31).text(snapshot.studentName, 90, 240, { width: width - 180, align: 'center' });
    document.moveTo(210, 284).lineTo(width - 210, 284).lineWidth(1).stroke(colors.accent);
    document.fillColor(colors.ink).font('Helvetica').fontSize(13).text(snapshot.design.achievementLine, 120, 305, { width: width - 240, align: 'center' });
    document.font('Helvetica-Bold').fontSize(12).text(snapshot.gradeName, 120, 340, { width: width - 240, align: 'center' });
    document.moveTo(95, 445).lineTo(285, 445).stroke('#718096');
    document.fillColor(colors.ink).font('Helvetica-Bold').fontSize(11).text(snapshot.design.signatoryName, 95, 452, { width: 190, align: 'center' });
    document.font('Helvetica').fontSize(9).text(snapshot.design.signatoryTitle, 95, 468, { width: 190, align: 'center' });
    document.moveTo(width - 285, 445).lineTo(width - 95, 445).stroke('#718096');
    document.font('Helvetica-Bold').fontSize(11).text(snapshot.issuedDate, width - 285, 452, { width: 190, align: 'center' });
    document.font('Helvetica').fontSize(9).text('Date issued', width - 285, 468, { width: 190, align: 'center' });
    document.fillColor('#526174').font('Helvetica').fontSize(8).text(`Credential ID ${snapshot.certificateId}  •  Verify with ${snapshot.institutionName}`, 70, height - 65, { width: width - 140, align: 'center' });
    document.end();
  });
}

export function snapshotFromRecord(record: any): CertificateSnapshot {
  if (record.snapshot && typeof record.snapshot === 'object') return record.snapshot as CertificateSnapshot;
  const studentName = `${record.student.user.firstName} ${record.student.user.lastName}`.trim();
  return {
    studentName,
    gradeName: record.student.grade?.name ?? 'Enrolled student',
    branchName: record.branch.name,
    institutionName: record.template.tenant?.name ?? record.branch.name,
    templateName: record.template.name,
    templateType: record.template.type,
    templateVersion: record.template.version ?? 1,
    issuedDate: record.issuedDate.toLocaleDateString('en-GB'),
    certificateId: record.certificateId,
    design: certificateDesign(record.template.layoutConfig, record.template.name),
  };
}
