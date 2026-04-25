async function test() {
    const res = await fetch("http://localhost:3000/api/erp/cash-sales?date=2026-04-24");
    if (!res.ok) {
        console.log("Failed", res.status, await res.text());
        return;
    }
    const data = await res.json();
    console.log(data);
}
test();
