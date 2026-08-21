const http = require('https');

const data = JSON.stringify({
  "jsonrpc": "2.0",
  "method": "eth_getCode",
  "params": ["0xB6CEceAB302E2E4948951eE7843FC24E92933061", "latest"],
  "id": 1
});

const options = {
  hostname: 'rpc.xlayer.tech',
  port: 443,
  path: '/',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = http.request(options, res => {
  let body = '';
  res.on('data', d => { body += d; });
  res.on('end', () => { console.log(body); });
});

req.on('error', error => { console.error(error); });
req.write(data);
req.end();
