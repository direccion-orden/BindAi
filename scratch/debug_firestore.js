import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";

const firebaseConfig = {
  projectId: "flowbot-e7ccf",
};
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function run() {
  const companies = await getDocs(collection(db, "companies"));
  const company = companies.docs[0];
  console.log("Company:", company.id);

  const productsSnap = await getDocs(collection(db, "companies", company.id, "products"));
  const products = productsSnap.docs.map(d => d.data());
  const closetProducts = products.filter(p => p.productType === "Closet" || (p.tags && p.tags.includes("Closet")) || p.title.includes("Closet") || p.title.includes("CLOSET"));
  console.log("Closet Products:", closetProducts.map(p => ({ title: p.title, productType: p.productType, tags: p.tags })));

  const discountsSnap = await getDocs(collection(db, "companies", company.id, "discounts"));
  const discounts = discountsSnap.docs.map(d => d.data());
  console.log("Discounts:", discounts);
}
run();
