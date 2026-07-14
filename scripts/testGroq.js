import dotenv from 'dotenv';
dotenv.config();
import Groq from 'groq-sdk';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// ✅ Models that work (from your list)
const MODELS_TO_TEST = [
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'qwen/qwen3-32b',
];

async function testGroq() {
  console.log('🔍 Testing Groq API...');
  console.log('📝 API Key:', process.env.GROQ_API_KEY?.substring(0, 10) + '...\n');
  
  // ✅ Test each model
  for (const model of MODELS_TO_TEST) {
    try {
      console.log(`🔄 Testing model: ${model}...`);
      const response = await groq.chat.completions.create({
        model: model,
        messages: [{ role: 'user', content: 'Say "Hello" in 2 words.' }],
        max_tokens: 10,
      });
      console.log(`✅ Model ${model} WORKS!`);
      console.log(`   Response: ${response.choices[0]?.message?.content}\n`);
    } catch (error) {
      console.log(`❌ Model ${model} FAILED: ${error.message}\n`);
    }
  }
}

testGroq();