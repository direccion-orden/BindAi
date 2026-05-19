const fs = require('fs');
const PDFParser = require("pdf2json");

const pdfFile = process.argv[2];
const outFile = process.argv[3];

if (!pdfFile || !outFile) {
    console.error("Usage: node read_pdf2.js <input.pdf> <output.txt>");
    process.exit(1);
}

const pdfParser = new PDFParser(this, 1);

pdfParser.on("pdfParser_dataError", errData => console.error(errData.parserError) );
pdfParser.on("pdfParser_dataReady", pdfData => {
    fs.writeFileSync(outFile, pdfParser.getRawTextContent());
    console.log(`Extracted PDF text to ${outFile}`);
});

pdfParser.loadPDF(pdfFile);
