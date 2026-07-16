import Groq from 'groq-sdk';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

const CLASSIFICATION_MODEL = process.env.GROQ_CLASSIFICATION_MODEL || 'llama-3.3-70b-versatile';

/**
 * Classify a transcript into a structured item using Groq's LLM.
 * Returns { type, title, startTime, priority } — never throws;
 * falls back to safe defaults on any failure so voice processing
 * never breaks because of this step.
 */
export const classifyTranscript = async (transcript) => {
  const now = new Date();
  const nowISO = now.toISOString();

  const systemPrompt = `You are a classifier for a voice productivity app. Given a spoken transcript, determine:
- "type": one of "Note", "Task", "Reminder", "Event"
- "title": a short, clean title (max 60 chars), rewritten from the transcript, not a verbatim copy
- "startTime": an ISO 8601 datetime if the user mentioned a specific date/time, else null
- "priority": "low", "medium", or "high" based on urgency implied

Guidelines:
- "Event" = meetings, appointments, calls with a specific time and another person involved
- "Reminder" = something to be reminded of at a specific time, often personal
- "Task" = something to get done, may or may not have a deadline
- "Note" = general thoughts, ideas, or information with no action/time implied

Current date/time for reference: ${nowISO}

Respond ONLY with valid JSON in this exact shape, no other text:
{"type": "...", "title": "...", "startTime": "..." or null, "priority": "..."}`;

  try {
    const completion = await groq.chat.completions.create({
      model: CLASSIFICATION_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: transcript },
      ],
      temperature: 0.2,
      max_tokens: 300,
      response_format: { type: 'json_object' },
    });

    const raw = completion.choices?.[0]?.message?.content;
    if (!raw) throw new Error('Empty classification response');

    const parsed = JSON.parse(raw);

    const validTypes = ['Note', 'Task', 'Reminder', 'Event'];
    const validPriorities = ['low', 'medium', 'high'];

    const type = validTypes.includes(parsed.type) ? parsed.type : 'Note';
    const priority = validPriorities.includes(parsed.priority) ? parsed.priority : 'medium';
    const title = (parsed.title || transcript.slice(0, 60)).slice(0, 60).trim();

    let startTime = null;
    if (parsed.startTime) {
      const d = new Date(parsed.startTime);
      if (!isNaN(d.getTime())) {
        startTime = d.toISOString();
      }
    }

    console.log('🤖 Classification result:', { type, title, startTime, priority });

    return { type, title, startTime, priority };
  } catch (error) {
    console.error('⚠️ Classification failed, falling back to defaults:', error.message);
    return {
      type: 'Note',
      title: transcript.slice(0, 60),
      startTime: null,
      priority: 'medium',
    };
  }
};

export default classifyTranscript;