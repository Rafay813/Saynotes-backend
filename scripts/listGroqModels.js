import dotenv from 'dotenv';
dotenv.config();
import Groq from 'groq-sdk';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

async function listGroqModels() {
  console.log('🔍 Fetching available Groq models...');
  console.log('📝 API Key:', process.env.GROQ_API_KEY?.substring(0, 10) + '...');
  
  try {
    const models = await groq.models.list();
    console.log('\n✅ Available Models:');
    console.log('----------------------------------------');
    models.data.forEach(model => {
      console.log(`  📌 ${model.id}`);
      console.log(`     Created: ${model.created}`);
      console.log(`     Object: ${model.object}`);
      console.log('----------------------------------------');
    });
  } catch (error) {
    console.error('❌ Failed to list models:', error.message);
    console.log('\n💡 Trying alternative method...');
    
    // ✅ Alternative: Try to get models through a simple request
    try {
      const response = await groq.chat.completions.create({
        model: 'mixtral-8x7b-32768', // Try one of the older models
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 1,
      });
      console.log('✅ Model mixtral-8x7b-32768 is available!');
    } catch (e) {
      console.log('❌ mixtral-8x7b-32768 failed:', e.message);
    }
  }
}

listGroqModels();