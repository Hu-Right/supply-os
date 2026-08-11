const https = require('https');

const API_KEY = 'sk-f9d3874ad7a5427ca02551933e983229';

const payload = JSON.stringify({
  model: 'deepseek-v4-flash',
  messages: [
    {
      role: 'system',
      content: 'You are a translator. Output ONLY a JSON array of translated strings. No explanations.'
    },
    {
      role: 'user',
      content: 'Translate the following texts to Chinese. Return a JSON array:\n["Supply, Installation and Rental of six Computers"]'
    }
  ],
  temperature: 0.3
});

const options = {
  hostname: 'api.deepseek.com',
  path: '/chat/completions',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${API_KEY}`
  }
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Response:', data);
  });
});

req.on('error', (e) => console.error('Error:', e.message));
req.write(payload);
req.end();
