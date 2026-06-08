function fixDoubleEncoding(str) {
  if (!str) return str;
  const bytes = [];
  for (let i = 0; i < str.length; i++) {
    const charCode = str.charCodeAt(i);
    if (charCode <= 0x7F) {
      bytes.push(charCode);
    } else if (charCode >= 0xA0 && charCode <= 0xFF) {
      bytes.push(charCode);
    } else {
      const char = str.charAt(i);
      switch (char) {
        case '€': bytes.push(0x80); break;
        case '‚': bytes.push(0x82); break;
        case 'ƒ': bytes.push(0x83); break;
        case '„': bytes.push(0x84); break;
        case '…': bytes.push(0x85); break;
        case '†': bytes.push(0x86); break;
        case '‡': bytes.push(0x87); break;
        case 'ˆ': bytes.push(0x88); break;
        case '‰': bytes.push(0x89); break;
        case 'Š': bytes.push(0x8A); break;
        case '‹': bytes.push(0x8B); break;
        case 'Œ': bytes.push(0x8C); break;
        case 'Ž': bytes.push(0x8E); break;
        case '‘': bytes.push(0x91); break;
        case '’': bytes.push(0x92); break;
        case '“': bytes.push(0x93); break;
        case '”': bytes.push(0x94); break;
        case '•': bytes.push(0x95); break;
        case '–': bytes.push(0x96); break;
        case '—': bytes.push(0x97); break;
        case '˜': bytes.push(0x98); break;
        case '™': bytes.push(0x99); break;
        case 'š': bytes.push(0x9A); break;
        case '›': bytes.push(0x9B); break;
        case 'œ': bytes.push(0x9C); break;
        case 'ž': bytes.push(0x9E); break;
        case 'Ÿ': bytes.push(0x9F); break;
        default:
          bytes.push(charCode & 0xFF);
          break;
      }
    }
  }
  return Buffer.from(bytes).toString('utf8');
}

const corrupted = [
  "ZURICH COMPAÃ‘IA DE SEGUROS SA",
  "RADIOMÃ³VIL DIPSA  S.A. DE C.V.",
  "Beatriz Adriana  OrduÃ±o Gil",
  "Marina Gabriela MartÃ­nez JimÃ©nez",
  "Laura CosÃ­o",
  "AngÃ©lica DÃ­az Maya",
  "STEPHANIA MUÃ‘OZ MALDONADO",
  "Organizador acrÃ­lico para gorras",
  "Set de 3 org para cajÃ³n",
  "ORGANIZADOR 40 x 14 x 7 SIN DIVISIÃ“N",
  "AsesorÃ­a de diseÃ±o de espacios:",
  "eBook InspiraciÃ³n y Usos de Nuestros Productos",
  "SOPORTE DE EXHIBICIÃ“N PARA PLATOS MEDIANO",
  "CajÃ³n AlÃ­a"
];

corrupted.forEach(str => {
  const fixed = fixDoubleEncoding(str);
  console.log(`Original: ${str}`);
  console.log(`Fixed   : ${fixed}`);
  console.log('---');
});
