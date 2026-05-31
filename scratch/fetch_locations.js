const projectId = "flowbot-e7ccf";
const companyId = "9b92345b-343f-4667-a110-53db7b3e1592";
const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/companies/${companyId}/locations`;

async function fetchLocations() {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`HTTP error ${res.status}: ${await res.text()}`);
    }
    const data = await res.json();
    console.log("REST LOCATIONS RESPONSE:");
    console.log(JSON.stringify(data, null, 2));
  } catch (err) {
    console.error(err);
  }
}

fetchLocations();
