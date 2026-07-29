import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const inputPath = path.resolve(root, "..", "checklist-testes-arcil-2026-07-29.md");
const outputPath = path.resolve(root, "..", "checklist-testes-arcil-2026-07-29.pdf");

const md = fs.readFileSync(inputPath, "utf8");
const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
const page = { width: 297, height: 210, marginX: 14, marginBottom: 16 };
let y = 18;

function ensureSpace(height) {
  if (y + height > page.height - page.marginBottom) {
    doc.addPage();
    y = 18;
  }
}

function addWrapped(text, options = {}) {
  const fontSize = options.fontSize ?? 9;
  const lineHeight = options.lineHeight ?? fontSize * 0.42;
  const indent = options.indent ?? 0;
  const maxWidth = page.width - page.marginX * 2 - indent;
  doc.setFont("helvetica", options.bold ? "bold" : "normal");
  doc.setFontSize(fontSize);
  doc.setTextColor(options.color ?? "#1f2937");
  const lines = doc.splitTextToSize(text, maxWidth);
  ensureSpace(lines.length * lineHeight + 2);
  doc.text(lines, page.marginX + indent, y);
  y += lines.length * lineHeight + (options.after ?? 2);
}

function parseTableRow(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) =>
      cell
        .trim()
        .replace(/`/g, "")
        .replace(/([_/-])/g, "$1 ")
    );
}

function isSeparator(line) {
  return /^\|\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line.trim());
}

function addTable(lines) {
  const rows = lines.map(parseTableRow);
  const head = [rows[0]];
  const body = rows.slice(2);
  ensureSpace(24);
  autoTable(doc, {
    head,
    body,
    startY: y,
    margin: { left: page.marginX, right: page.marginX },
    styles: {
      font: "helvetica",
      fontSize: 5.8,
      cellPadding: 1.45,
      overflow: "linebreak",
      valign: "top",
      minCellWidth: 4,
      lineColor: [216, 222, 232],
      lineWidth: 0.15,
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: "bold",
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 21 },
      1: { cellWidth: 28 },
      2: { cellWidth: 43 },
      3: { cellWidth: 54 },
      4: { cellWidth: 70 },
      5: { cellWidth: 24 },
    },
    didDrawPage: () => {
      y = 18;
    },
  });
  y = doc.lastAutoTable.finalY + 7;
}

const lines = md.split(/\r?\n/);
for (let i = 0; i < lines.length; i += 1) {
  const raw = lines[i];
  const line = raw.trim();

  if (!line) {
    y += 1.5;
    continue;
  }

  if (line.startsWith("|")) {
    const tableLines = [];
    while (i < lines.length && lines[i].trim().startsWith("|")) {
      tableLines.push(lines[i]);
      i += 1;
    }
    i -= 1;
    if (tableLines.length >= 3 && isSeparator(tableLines[1])) addTable(tableLines);
    continue;
  }

  if (line.startsWith("# ")) {
    ensureSpace(18);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor("#0f172a");
    doc.text(line.replace(/^# /, ""), page.marginX, y);
    y += 11;
    continue;
  }

  if (line.startsWith("## ")) {
    ensureSpace(13);
    y += 3;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor("#0f172a");
    doc.text(line.replace(/^## /, ""), page.marginX, y);
    y += 7;
    continue;
  }

  if (line.startsWith("### ")) {
    ensureSpace(10);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor("#1e3a8a");
    doc.text(line.replace(/^### /, ""), page.marginX, y);
    y += 6;
    continue;
  }

  if (line.startsWith("- [ ] ")) {
    addWrapped(`[ ] ${line.replace(/^- \[ \] /, "")}`, { indent: 2, fontSize: 8.7, after: 1.2 });
    continue;
  }

  if (line.startsWith("- ")) {
    addWrapped(`- ${line.replace(/^- /, "")}`, { indent: 2, fontSize: 8.7, after: 1.2 });
    continue;
  }

  addWrapped(line.replace(/\*\*/g, ""), { fontSize: 9.2, after: 2 });
}

const pageCount = doc.getNumberOfPages();
for (let n = 1; n <= pageCount; n += 1) {
  doc.setPage(n);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor("#64748b");
  doc.text(`Checklist de testes Arcil - 2026-07-29 - pagina ${n}/${pageCount}`, page.marginX, page.height - 10);
}

doc.save(outputPath);
console.log(outputPath);
