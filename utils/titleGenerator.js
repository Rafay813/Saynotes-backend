/**
 * Build a clean, consistent title from parsed AI metadata
 * Hybrid approach: AI extracts intent, backend builds title
 */
export function buildTitle(parsed) {
  const { type, action, person, object, items, location } = parsed;

  switch (type) {
    case 'Event':
      if (action === 'meeting' && person) {
        return `Meeting with ${person}`;
      }
      if (action === 'meeting' && location) {
        return `Meeting at ${location}`;
      }
      if (action === 'meeting') {
        return 'Meeting';
      }
      if (action === 'appointment') {
        if (person) return `Appointment with ${person}`;
        return 'Appointment';
      }
      if (action === 'call' && person) {
        return `Call with ${person}`;
      }
      if (action === 'lunch' || action === 'dinner') {
        return `${action.charAt(0).toUpperCase() + action.slice(1)}`;
      }
      if (action === 'interview') {
        return 'Interview';
      }
      if (action === 'presentation') {
        return 'Presentation';
      }
      if (action === 'webinar') {
        return 'Webinar';
      }
      if (action === 'conference') {
        return 'Conference';
      }
      if (action === 'workshop') {
        return 'Workshop';
      }
      return 'Event';

    case 'Reminder':
      if (action === 'call' && person) {
        return `Call ${person}`;
      }
      if (action === 'call') {
        return 'Phone Call';
      }
      if (action === 'pay' || action === 'payment') {
        return 'Payment Reminder';
      }
      if (action === 'invoice') {
        return 'Invoice Reminder';
      }
      if (action === 'bill') {
        return 'Bill Reminder';
      }
      if (action === 'medication' || action === 'medicine') {
        return 'Medicine Reminder';
      }
      if (action === 'dentist') {
        return 'Dentist Reminder';
      }
      if (action === 'doctor') {
        return 'Doctor Reminder';
      }
      if (action === 'birthday') {
        return 'Birthday Reminder';
      }
      if (action === 'anniversary') {
        return 'Anniversary Reminder';
      }
      if (action === 'deadline') {
        return 'Deadline Reminder';
      }
      if (action === 'submit') {
        return object ? `Submit ${object}` : 'Submission Reminder';
      }
      if (action === 'meeting') {
        return person ? `Reminder: ${person}` : 'Meeting Reminder';
      }
      if (action === 'email' && person) {
        return `Email ${person}`;
      }
      return 'Reminder';

    case 'Task':
      if (action === 'buy' || action === 'purchase') {
        if (items && items.length > 0) {
          const first = items[0];
          const rest = items.length > 1 ? ` + ${items.length - 1} more` : '';
          return `Buy ${first}${rest}`;
        }
        return 'Buy Groceries';
      }
      if (action === 'submit') {
        return object ? `Submit ${object}` : 'Submit Work';
      }
      if (action === 'assignment') {
        return 'Submit Assignment';
      }
      if (action === 'project') {
        return 'Project Work';
      }
      if (action === 'homework') {
        return 'Homework';
      }
      if (action === 'email' && person) {
        return `Email ${person}`;
      }
      if (action === 'email') {
        return 'Send Email';
      }
      if (action === 'call' && person) {
        return `Call ${person}`;
      }
      if (action === 'call') {
        return 'Phone Call';
      }
      if (action === 'clean' || action === 'tidy') {
        return 'Cleaning Task';
      }
      if (action === 'organize') {
        return 'Organize';
      }
      if (action === 'review') {
        return 'Review';
      }
      if (action === 'check') {
        return 'Check';
      }
      if (action === 'prepare') {
        return 'Prepare';
      }
      if (action === 'schedule') {
        return 'Schedule';
      }
      if (action === 'create') {
        return 'Create';
      }
      if (action === 'write') {
        return 'Write';
      }
      if (action === 'read') {
        return 'Read';
      }
      if (action === 'study') {
        return 'Study';
      }
      if (action === 'exercise' || action === 'workout') {
        return 'Exercise';
      }
      if (action === 'cook') {
        return 'Cook';
      }
      if (action === 'order') {
        return 'Order';
      }
      if (action === 'pickup') {
        return 'Pick Up';
      }
      if (action === 'dropoff') {
        return 'Drop Off';
      }
      return 'Task';

    case 'Note':
    default:
      // For notes, use the summary or first few words
      if (parsed.summary) {
        return parsed.summary;
      }
      return 'Note';
  }
}

/**
 * Generate title from parsed metadata
 * This is the main function to use
 */
export function generateTitle(parsed, transcript) {
  // If we have structured data, build a clean title
  if (parsed.action || parsed.person || parsed.items) {
    const title = buildTitle(parsed);
    // If title is not generic and has content, return it
    if (title && title !== 'Event' && title !== 'Reminder' && 
        title !== 'Task' && title !== 'Note') {
      return title;
    }
  }

  // Fallback: Use first 5-6 words of transcript
  const words = transcript
    .trim()
    .split(/\s+/)
    .filter(w => w.length > 0)
    .slice(0, 6)
    .join(' ');
  
  if (words.length > 0) {
    const title = words.charAt(0).toUpperCase() + words.slice(1);
    const totalWords = transcript.trim().split(/\s+/).length;
    return totalWords > 6 ? title + '...' : title;
  }
  
  return 'Untitled';
}

export default {
  buildTitle,
  generateTitle,
};