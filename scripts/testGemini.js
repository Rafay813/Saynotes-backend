import dotenv from 'dotenv';
dotenv.config();
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ✅ Test different models
const MODELS_TO_TEST = [
  'gemini-1.0-pro',
  'gemini-pro',
  'gemini-1.5-flash',
  'gemini-1.5-pro',
  'gemini-2.0-flash-exp',
  'gemini-2.0-flash-lite',
];

async function testModels() {
  console.log('🔍 Testing Gemini API key...');
  console.log(`📝 API Key: ${process.env.GEMINI_API_KEY?.substring(0, 10)}...\n`);
  
  for (const modelName of MODELS_TO_TEST) {
    try {
      console.log(`🔄 Testing model: ${modelName}...`);
      
      const model = genAI.getGenerativeModel({ model: modelName });
      
      // ✅ Simple test prompt
      const result = await model.generateContent('Say "Hello" in 2 words.');
      const response = await result.response;
      const text = response.text();
      
      console.log(`✅ Model ${modelName} WORKS!`);
      console.log(`   Response: ${text}\n`);
    } catch (error) {
      console.log(`❌ Model ${modelName} FAILED:`);
      console.log(`   ${error.message}\n`);
    }
  }
}

testModels();