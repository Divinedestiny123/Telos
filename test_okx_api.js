const https = require('https');

https.get('https://api.coingecko.com/api/v3/search/trending', {
  headers: { 'User-Agent': 'Mozilla/5.0' }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log(data.substring(0, 500));
  });
}).on('error', err => console.error(err));
