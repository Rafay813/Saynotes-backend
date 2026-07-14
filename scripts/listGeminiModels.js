import dotenv from 'dotenv';
dotenv.config();
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function listModels() {
  try {
    console.log('🔍 Fetching available Gemini models...');
    const result = await genAI.listModels();
    console.log('✅ Available models:');
    result.models.forEach(model => {
      console.log(`  - ${model.name} (${model.displayName})`);
    });
  } catch (error) {
    console.error('❌ Error listing models:', error.message);
  }
}

listModels();