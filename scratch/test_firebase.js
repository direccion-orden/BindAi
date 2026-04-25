async function test() {
    const res = await fetch("https://bind-ai-6f1fc.web.app/api/erp/cash-sales?date=2026-04-24");
    if (!res.ok) {
        console.log("Failed", res.status);
        return;
    }
    const data = await res.json();
    console.log(data);
}
test();
