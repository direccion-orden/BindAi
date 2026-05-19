const { Fiel } = require('@nodecfdi/sat-ws-descarga-masiva');

function formatPEM(base64Str, header) {
    const lines = base64Str.match(/.{1,64}/g).join('\n');
    return `-----BEGIN ${header}-----\n${lines}\n-----END ${header}-----`;
}

// Just checking if function does not crash on syntax
console.log("Syntax check passed");
