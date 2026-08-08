// test-assistant.js
// Run with: node test-assistant.js
// (Run this from VS Code's integrated terminal, inside your backend project folder)

const BASE_URL = 'https://reword-cone-smitten.ngrok-free.dev'; // ⬅️ update if your ngrok URL changes
const CLERK_TOKEN = 'PASTE_YOUR_FRESH_TOKEN_HERE'; // ⬅️ paste a fresh token right before running

async function testAssistant() {
  try {
    const res = await fetch(`${BASE_URL}/api/v1/assistant/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CLERK_TOKEN}`,
        'ngrok-skip-browser-warning': 'true',
      },
      body: JSON.stringify({
        message: 'remind me to call mom tomorrow at 9am',
        history: [],
        timezone: 'Asia/Karachi',
      }),
    });

    console.log('Status:', res.status);

    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await res.json();
      console.log('Response JSON:', JSON.stringify(data, null, 2));
    } else {
      const text = await res.text();
      console.log('Response (non-JSON, first 500 chars):', text.slice(0, 500));
    }
  } catch (err) {
    console.error('Request failed:', err.message);
  }
}

testAssistant();