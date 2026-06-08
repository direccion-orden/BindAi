const fs = require('fs');

const filePath = "C:\\Users\\Elitebook 840 G11\\Downloads\\Productos (6).csv";
if (!fs.existsSync(filePath)) {
  console.error("File not found!");
  process.exit(1);
}

const buffer = fs.readFileSync(filePath);

// Check if buffer starts with UTF-8 BOM
const hasBOM = buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF;
console.log(`Has UTF-8 BOM: ${hasBOM}`);

// Try decoding as UTF-8
const utf8Str = buffer.toString('utf8');
// Try decoding as latin1 (ISO-8859-1)
const latin1Str = buffer.toString('binary'); // Node's 'binary' is actually raw bytes, but we can decode ISO-8859-1 / Windows-1252 using iconv-lite or custom mapping.
// Let's use standard TextDecoder
const decoderUtf8 = new TextDecoder('utf-8');
const decoderLatin1 = new TextDecoder('iso-8859-1');

const decodedUtf8 = decoderUtf8.decode(buffer);
const decodedLatin1 = decoderLatin1.decode(buffer);

console.log("\n=== FIRST 500 CHARACTERS UTF-8 ===");
console.log(decodedUtf8.substring(0, 1000).replace(/\r\n/g, '\n'));

console.log("\n=== FIRST 500 CHARACTERS LATIN1 ===");
console.log(decodedLatin1.substring(0, 1000).replace(/\r\n/g, '\n'));

// Let's search for "toile" in both
const indexUtf8 = decodedUtf8.indexOf("toile");
if (indexUtf8 !== -1) {
  console.log("\nFound 'toile' in UTF-8 around index:", indexUtf8);
  console.log(decodedUtf8.substring(indexUtf8 - 20, indexUtf8 + 40));
}

const indexLatin1 = decodedLatin1.indexOf("toile");
if (indexLatin1 !== -1) {
  console.log("\nFound 'toile' in LATIN1 around index:", indexLatin1);
  console.log(decodedLatin1.substring(indexLatin1 - 20, indexLatin1 + 40));
}
