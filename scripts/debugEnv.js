import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env
dotenv.config({ path: path.join(__dirname, '../.env') });

console.log('🔍 Environment Debug:');
console.log('----------------------------------------');
console.log('ELEVENLABS_API_KEY exists:', !!process.env.ELEVENLABS_API_KEY);
console.log('Key value:', process.env.ELEVENLABS_API_KEY);
console.log('Key length:', process.env.ELEVENLABS_API_KEY ? process.env.ELEVENLABS_API_KEY.length : 0);
console.log('Key starts with sk_:', process.env.ELEVENLABS_API_KEY ? process.env.ELEVENLABS_API_KEY.startsWith('sk_') : false);
console.log('----------------------------------------');