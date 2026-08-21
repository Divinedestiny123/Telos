// Quick Anthropic connectivity test
const https = require('https');
const fs = require('fs');

// Read the key from .env.local
const envContent = fs.readFileSync('.env.local', 'utf8');
const keyMatch = envContent.match(/ANTHROPIC_API_KEY=(.+)/);
const apiKey = keyMatch ? keyMatch[1].trim() : '';

if (!apiKey) {
  console.error('No ANTHROPIC_API_KEY found in .env.local');
  process.exit(1);
}

console.log('Key found:', apiKey.slice(0, 20) + '...');
console.log('Testing API call...');

const body = JSON.stringify({
  model: 'claude-3-5-sonnet-20241022',
  max_tokens: 50,
  messages: [{ role: 'user', content: 'Say hello in 5 words' }]
});

const options = {
  hostname: 'api.anthropic.com',
  port: 443,
  path: '/v1/messages',
  method: 'POST',
  timeout: 15000,
  family: 4, // Force IPv4
  headers: {
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(body)
  }
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Response:', data);
  });
});

req.on('timeout', () => {
  console.error('ERROR: Request timed out after 15 seconds - NETWORK BLOCKED');
  req.destroy();
});

req.on('error', (err) => {
  console.error('ERROR:', err.message);
});

req.write(body);
req.end();
