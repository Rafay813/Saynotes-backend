/**
 * Gemini Briefing Service
 * Replaces services/mockBriefingService.js.
 * Summarizes a day's items into a natural, conversational briefing script.
 */

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const fallbackSummary = (items) => {
  const taskCount = items.filter((i) => i.type === 'Task').length;
  const eventCount = items.filter((i) => i.type === 'Event').length;
  const reminderCount = items.filter((i) => i.type === 'Reminder').length;
  return `Good morning! You have ${taskCount} task(s), ${eventCount} meeting(s), and ${reminderCount} reminder(s) today.`;
};

export const generateBriefingTextService = async (items) => {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error('GEMINI_API_KEY is not set. Falling back to a templated briefing.');
    return fallbackSummary(items);
  }

  if (!items || items.length === 0) {
    return "Good morning! You don't have anything scheduled today. A clean slate!";
  }

  const compactItems = items.map((i) => ({
    type: i.type,
    title: i.title,
    startTime: i.startTime,
    endTime: i.endTime,
    status: i.status,
  }));

  const prompt = `Summarize these items into a natural, conversational morning briefing script a friendly assistant would read aloud. Keep it under 80 words, mention counts and the most time-sensitive items first, and skip any JSON/markdown formatting — plain spoken text only.\n\nItems:\n${JSON.stringify(compactItems)}`;

  try {
    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.5 },
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`Gemini API error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return text ? text.trim() : fallbackSummary(items);
  } catch (error) {
    console.error('Error generating briefing via Gemini, using fallback:', error.message);
    return fallbackSummary(items);
  }
};
