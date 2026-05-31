const fs = require('fs');
let rules = fs.readFileSync('firestore.rules', 'utf8');

const insertion = `
      match /banks/{document=**} {
        allow read, write: if isUserOfCompany(companyId);
      }
      match /providers/{document=**} {
        allow read, write: if isUserOfCompany(companyId);
      }
      match /orders/{document=**} {
        allow read, write: if isUserOfCompany(companyId);
      }
      match /invoices/{document=**} {
        allow read, write: if isUserOfCompany(companyId);
      }
      match /remissions/{document=**} {
        allow read, write: if isUserOfCompany(companyId);
      }
`;

rules = rules.replace(
  `      match /bankAccounts/{document=**} {
        allow read, write: if isUserOfCompany(companyId);
      }`,
  `      match /bankAccounts/{document=**} {
        allow read, write: if isUserOfCompany(companyId);
      }` + insertion
);

fs.writeFileSync('firestore.rules', rules);
