const fs = require('fs');
const code = fs.readFileSync('src/app/(dashboard)/productos/nuevo/page.tsx', 'utf-8');

function checkSelfClosing(tagName) {
  let inTag = false;
  let str = '';
  let inString = false;
  let stringChar = '';
  let inExpr = 0;
  
  for (let i = 0; i < code.length; i++) {
    const c = code[i];
    
    if (!inTag) {
      if (code.startsWith('<' + tagName, i)) {
        inTag = true;
        str = '<' + tagName;
        i += tagName.length - 1;
      }
    } else {
      str += c;
      if (inString) {
        if (c === stringChar && code[i-1] !== '\\') inString = false;
      } else if (inExpr > 0) {
        if (c === '{') inExpr++;
        if (c === '}') inExpr--;
      } else {
        if (c === '\'' || c === '"') {
          inString = true;
          stringChar = c;
        } else if (c === '{') {
          inExpr++;
        } else if (c === '>') {
          inTag = false;
          if (!str.endsWith('/>')) {
            console.log('UNCLOSED ' + tagName + ':', str.trim().split('\n').join(' '));
          }
        }
      }
    }
  }
}

['Input', 'SatCatalogSelect', 'img', 'Sparkles', 'Loader2'].forEach(checkSelfClosing);
