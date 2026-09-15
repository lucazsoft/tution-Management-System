from pathlib import Path
import re

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase import pdfmetrics
from reportlab.platypus import (
    BaseDocTemplate, Frame, PageTemplate, PageBreak, Paragraph, Spacer,
    Table, TableStyle, KeepTogether
)

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "docs" / "parent-student-web-portal-qa-report-2026-09-15.md"
OUTPUT = ROOT / "output" / "pdf" / "TMS_Parent_Student_Web_Portal_QA_Report_2026-09-15.pdf"

NAVY = colors.HexColor("#102A43")
BLUE = colors.HexColor("#1769AA")
LIGHT_BLUE = colors.HexColor("#EAF3FA")
PALE = colors.HexColor("#F5F8FB")
GOLD = colors.HexColor("#C8912D")
TEXT = colors.HexColor("#243B53")
MUTED = colors.HexColor("#627D98")
LINE = colors.HexColor("#D9E2EC")
RED = colors.HexColor("#B42318")


def register_fonts():
    candidates = [
        ("DejaVuSans", "C:/Windows/Fonts/arial.ttf", "C:/Windows/Fonts/arialbd.ttf"),
        ("DejaVuSans", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
    ]
    for family, regular, bold in candidates:
        if Path(regular).exists() and Path(bold).exists():
            pdfmetrics.registerFont(TTFont(family, regular))
            pdfmetrics.registerFont(TTFont(f"{family}-Bold", bold))
            return family, f"{family}-Bold"
    return "Helvetica", "Helvetica-Bold"


FONT, FONT_BOLD = register_fonts()


def clean(text: str) -> str:
    replacements = {
        "—": "-", "–": "-", "‑": "-", "“": '"', "”": '"',
        "‘": "'", "’": "'", "…": "...", "×": "x", "→": "to",
    }
    for old, new in replacements.items():
        text = text.replace(old, new)
    text = text.replace("&", "&amp;")
    text = re.sub(r"`([^`]+)`", r"<font name='Courier'>\1</font>", text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", text)
    return text


styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="CoverKicker", fontName=FONT_BOLD, fontSize=10, leading=13, textColor=GOLD, alignment=TA_CENTER, spaceAfter=8))
styles.add(ParagraphStyle(name="CoverTitle", fontName=FONT_BOLD, fontSize=26, leading=31, textColor=NAVY, alignment=TA_CENTER, spaceAfter=14))
styles.add(ParagraphStyle(name="CoverSub", fontName=FONT, fontSize=11, leading=17, textColor=MUTED, alignment=TA_CENTER, spaceAfter=5))
styles.add(ParagraphStyle(name="H1x", fontName=FONT_BOLD, fontSize=18, leading=23, textColor=NAVY, spaceBefore=4, spaceAfter=10, keepWithNext=True))
styles.add(ParagraphStyle(name="H2x", fontName=FONT_BOLD, fontSize=13.5, leading=18, textColor=BLUE, spaceBefore=12, spaceAfter=7, keepWithNext=True))
styles.add(ParagraphStyle(name="H3x", fontName=FONT_BOLD, fontSize=11, leading=15, textColor=NAVY, spaceBefore=9, spaceAfter=5, keepWithNext=True))
styles.add(ParagraphStyle(name="Bodyx", fontName=FONT, fontSize=8.7, leading=13, textColor=TEXT, spaceAfter=6))
styles.add(ParagraphStyle(name="Bulletx", fontName=FONT, fontSize=8.5, leading=12.5, leftIndent=13, firstLineIndent=-7, textColor=TEXT, spaceAfter=3))
styles.add(ParagraphStyle(name="TableHead", fontName=FONT_BOLD, fontSize=7.2, leading=9, textColor=colors.white))
styles.add(ParagraphStyle(name="TableCell", fontName=FONT, fontSize=6.8, leading=9, textColor=TEXT))
styles.add(ParagraphStyle(name="TableCellBold", fontName=FONT_BOLD, fontSize=6.8, leading=9, textColor=TEXT))
styles.add(ParagraphStyle(name="Meta", fontName=FONT, fontSize=8, leading=12, textColor=MUTED))
styles.add(ParagraphStyle(name="Callout", fontName=FONT_BOLD, fontSize=9, leading=14, textColor=RED, backColor=colors.HexColor("#FEF3F2"), borderColor=colors.HexColor("#FDA29B"), borderWidth=.6, borderPadding=8, spaceAfter=10))


class ReportDoc(BaseDocTemplate):
    pass


def header_footer(canvas, doc):
    canvas.saveState()
    width, height = A4
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.5)
    canvas.line(18 * mm, height - 14 * mm, width - 18 * mm, height - 14 * mm)
    canvas.setFont(FONT_BOLD, 7.5)
    canvas.setFillColor(NAVY)
    canvas.drawString(18 * mm, height - 10.5 * mm, "TMS - PARENT AND STUDENT WEB PORTAL QA")
    canvas.setFont(FONT, 7.5)
    canvas.setFillColor(MUTED)
    canvas.drawRightString(width - 18 * mm, height - 10.5 * mm, "CONFIDENTIAL - DEVELOPMENT USE")
    canvas.line(18 * mm, 14 * mm, width - 18 * mm, 14 * mm)
    canvas.drawString(18 * mm, 9.5 * mm, "Assessment date: 15 September 2026")
    canvas.drawRightString(width - 18 * mm, 9.5 * mm, f"Page {doc.page}")
    canvas.restoreState()


def cover(canvas, doc):
    canvas.saveState()
    width, height = A4
    canvas.setFillColor(NAVY)
    canvas.rect(0, height - 65 * mm, width, 65 * mm, fill=1, stroke=0)
    canvas.setFillColor(GOLD)
    canvas.rect(0, height - 68 * mm, width, 3 * mm, fill=1, stroke=0)
    canvas.restoreState()


def table_from_rows(rows, available_width):
    cols = len(rows[0])
    if cols == 2:
        widths = [available_width * .25, available_width * .75]
    elif cols == 3:
        widths = [available_width * .20, available_width * .24, available_width * .56]
    elif cols == 4:
        widths = [available_width * .15, available_width * .24, available_width * .19, available_width * .42]
    else:
        widths = [available_width / cols] * cols
    data = []
    for ridx, row in enumerate(rows):
        style = styles["TableHead"] if ridx == 0 else styles["TableCell"]
        data.append([Paragraph(clean(cell), style) for cell in row])
    table = Table(data, colWidths=widths, repeatRows=1, hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), .4, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, PALE]),
    ]))
    return table


def parse_markdown(text, available_width):
    lines = text.splitlines()
    story = []
    paragraph = []
    index = 0

    def flush_paragraph():
        if paragraph:
            story.append(Paragraph(clean(" ".join(part.strip() for part in paragraph)), styles["Bodyx"]))
            paragraph.clear()

    while index < len(lines):
        line = lines[index].rstrip()
        stripped = line.strip()
        if not stripped:
            flush_paragraph()
            index += 1
            continue
        if stripped.startswith("|"):
            flush_paragraph()
            rows = []
            while index < len(lines) and lines[index].strip().startswith("|"):
                cells = [c.strip() for c in lines[index].strip().strip("|").split("|")]
                if not all(re.fullmatch(r":?-{3,}:?", c) for c in cells):
                    rows.append(cells)
                index += 1
            if rows:
                story.append(table_from_rows(rows, available_width))
                story.append(Spacer(1, 7))
            continue
        heading = re.match(r"^(#{1,4})\s+(.+)$", stripped)
        if heading:
            flush_paragraph()
            level = len(heading.group(1))
            title = heading.group(2)
            if level == 1:
                index += 1
                continue
            if level == 2 and title.startswith(("5. ", "6. ", "10. ")):
                story.append(PageBreak())
            style = styles["H1x"] if level == 2 else styles["H2x"] if level == 3 else styles["H3x"]
            story.append(Paragraph(clean(title), style))
            index += 1
            continue
        if re.match(r"^[-*]\s+", stripped):
            flush_paragraph()
            story.append(Paragraph("- " + clean(re.sub(r"^[-*]\s+", "", stripped)), styles["Bulletx"]))
            index += 1
            continue
        numbered = re.match(r"^(\d+)\.\s+(.+)$", stripped)
        if numbered:
            flush_paragraph()
            story.append(Paragraph(f"{numbered.group(1)}. {clean(numbered.group(2))}", styles["Bulletx"]))
            index += 1
            continue
        if stripped.startswith("**") and ":**" in stripped:
            flush_paragraph()
            label, value = stripped.split(":**", 1)
            label = label.replace("**", "")
            story.append(Paragraph(f"<b>{clean(label)}:</b>{clean(value)}", styles["Meta"]))
            index += 1
            continue
        paragraph.append(stripped)
        index += 1
    flush_paragraph()
    return story


def build():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    width, height = A4
    frame = Frame(18 * mm, 18 * mm, width - 36 * mm, height - 36 * mm, leftPadding=0, rightPadding=0, topPadding=3 * mm, bottomPadding=2 * mm)
    first_frame = Frame(22 * mm, 28 * mm, width - 44 * mm, height - 52 * mm, leftPadding=0, rightPadding=0, topPadding=72 * mm, bottomPadding=0)
    doc = ReportDoc(str(OUTPUT), pagesize=A4, leftMargin=18*mm, rightMargin=18*mm, topMargin=18*mm, bottomMargin=18*mm,
                    title="TMS Parent and Student Web Portal QA Report", author="TMS Engineering QA")
    doc.addPageTemplates([
        PageTemplate(id="Cover", frames=[first_frame], onPage=cover, autoNextPageTemplate="Body"),
        PageTemplate(id="Body", frames=[frame], onPage=header_footer),
    ])

    story = [
        Paragraph("TUITION MANAGEMENT SYSTEM", styles["CoverKicker"]),
        Paragraph("Parent and Student<br/>Web Portal QA Report", styles["CoverTitle"]),
        Paragraph("Implementation readiness, requirement traceability, security, and release gates", styles["CoverSub"]),
        Spacer(1, 18),
        Table([
            [Paragraph("Assessment date", styles["TableCellBold"]), Paragraph("15 September 2026", styles["TableCell"])],
            [Paragraph("Application", styles["TableCellBold"]), Paragraph("React / TypeScript web portal", styles["TableCell"])],
            [Paragraph("Assessment status", styles["TableCellBold"]), Paragraph("NOT RELEASE-READY", styles["TableCellBold"])],
            [Paragraph("Classification", styles["TableCellBold"]), Paragraph("Confidential - development use", styles["TableCell"])],
        ], colWidths=[42*mm, 92*mm], style=TableStyle([
            ("BACKGROUND", (0,0), (-1,-1), colors.white), ("GRID", (0,0), (-1,-1), .5, LINE),
            ("VALIGN", (0,0), (-1,-1), "MIDDLE"), ("LEFTPADDING", (0,0), (-1,-1), 8),
            ("RIGHTPADDING", (0,0), (-1,-1), 8), ("TOPPADDING", (0,0), (-1,-1), 8),
            ("BOTTOMPADDING", (0,0), (-1,-1), 8), ("TEXTCOLOR", (1,2), (1,2), RED),
        ])),
        Spacer(1, 18),
        Paragraph("Release decision", styles["H2x"]),
        Paragraph("Do not release until all P0 findings and the identified critical Student and Parent workflow findings are closed.", styles["Callout"]),
        PageBreak(),
    ]
    source = SOURCE.read_text(encoding="utf-8")
    story.extend(parse_markdown(source, width - 36 * mm))
    doc.build(story)
    print(OUTPUT)


if __name__ == "__main__":
    build()
