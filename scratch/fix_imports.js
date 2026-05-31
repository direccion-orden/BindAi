const fs = require('fs');

let idPage = fs.readFileSync('src/app/(dashboard)/productos/[id]/page.tsx', 'utf8');

idPage = idPage.replace(
  'import { doc, getDoc, updateDoc, deleteDoc, serverTimestamp } from "firebase/firestore";',
  'import { doc, getDoc, updateDoc, deleteDoc, serverTimestamp, collection, query, onSnapshot } from "firebase/firestore";'
);

fs.writeFileSync('src/app/(dashboard)/productos/[id]/page.tsx', idPage, 'utf8');
console.log('Added missing Firestore imports to idPage');
