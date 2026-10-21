// What the caller sees at each stage.
//
// "mayHear" and "seen" come from reading the 100 practice transcripts:
// the lines are typical of what prospects said at that point (reworded,
// no real names), and the numbers count calls out of the 100.
//
// A tap with an `outcome` points to how the call is likely to be logged.
// The close screen uses the last such tap as its starting suggestion.
// `ends: true` marks taps after which calls in the transcripts usually ended.

export const STAGES = [
  {
    number: 1,
    name: 'Opening',
    goal: 'Reach the right person and say who you are. They decide in the first few seconds whether this is worth a minute.',
    mayHear: [
      'Who is this? Calling from where?',
      'He left years ago. This is my number now.',
      'I am driving, make it quick.',
    ],
    seen: '10 of 100 calls ended at the opening: an old number, someone who had moved on, a bad line, or a language the caller did not speak.',
    taps: [
      { label: 'Right person, listening' },
      { label: 'Asked who is calling' },
      { label: 'Busy, call back later', outcome: 'follow_up', ends: true },
      { label: 'Wrong person or old number', outcome: 'wrong_person', ends: true },
      { label: 'Moved to another company', outcome: 'moved_company', ends: true },
      { label: 'Bad line or language', outcome: 'call_again', ends: true },
    ],
    wordsLabel: 'Their words',
  },
  {
    number: 2,
    name: 'Purpose',
    goal: 'Say why you called in one or two sentences they could repeat to a colleague. Say the company name slowly; it rarely lands the first time.',
    mayHear: [
      'Calling from where? Meridian?',
      'What is this regarding?',
      'Is it paid? What do you get out of it?',
    ],
    seen: '34 of 100 prospects asked where the caller was calling from, often twice. Only 5 asked where we got their number.',
    taps: [
      { label: 'Asked where we are calling from' },
      { label: 'Asked what it is about' },
      { label: 'Asked about cost or our motive' },
      { label: 'Thought it was a job, a bank or a vendor' },
      { label: 'Understood, go on' },
    ],
    wordsLabel: 'Their words',
  },
  {
    number: 3,
    name: 'Permission',
    goal: 'Get a clear yes, a clear no, or a time to call back. Talking on without one is not a yes.',
    mayHear: [
      'I am driving. How much time will you take?',
      'Going into a meeting, call me in an hour.',
      'Send it on WhatsApp first.',
    ],
    seen: '15 of 100 prospects were driving, travelling, in a meeting or on another call. When they name a time, take their time, not yours.',
    taps: [
      { label: 'Clear yes' },
      { label: 'Short yes, then quiet' },
      { label: 'Kept talking, no answer' },
      { label: 'Send it in writing first' },
      { label: 'Call back at a time they named', outcome: 'follow_up', ends: true },
      { label: 'No', outcome: 'not_interested', ends: true },
    ],
    wordsLabel: 'Their words (the time, if they named one)',
  },
  {
    number: 4,
    name: 'Their business',
    goal: 'Ask about their company and their work before saying more about yours.',
    mayHear: [
      'Tell me about your company first.',
      'We are the market leader. / We only do job work.',
      'I cannot share anything about the company.',
    ],
    seen: 'Only 27 of 100 calls got the prospect talking about their own business. Several corrected the caller: wrong size, wrong line of work, a different division.',
    taps: [
      { label: 'Talked about their business' },
      { label: 'One-line answer, waiting for the pitch' },
      { label: 'Corrected us (size, line, division)' },
      { label: 'Asked about us first' },
      { label: 'Will not share company details' },
    ],
    wordsLabel: 'Their words',
  },
  {
    number: 5,
    name: 'Their need',
    title: 'Their need, in their words',
    goal: 'Hear what they are trying to do or what is in the way. Write it down the way they say it.',
    mayHear: [
      'The biggest challenge is skilled manpower.',
      'We are fine. We do not need new customers.',
      'What can you do for a company like ours?',
    ],
    seen: 'Only 15 of 100 prospects said a need in their own words. Most of those came after an open question, such as "what is the one thing in the way of that goal?", not after yes-or-no questions.',
    taps: [
      { label: 'Named a goal or a problem' },
      { label: 'Everything is fine' },
      { label: 'Asked what we can do for them' },
      { label: 'Will not share their plans' },
    ],
    wordsLabel: 'Their words, exactly as said',
    wordsHint: 'Write what they said, not what you understood.',
    wordsMain: true,
  },
  {
    number: 6,
    name: 'Objection',
    goal: 'Hear the reason for the no and understand it before you answer. A reason you talked over cannot be answered on the next call.',
    mayHear: [
      'I am not the right person. Talk to head office.',
      'We already work with consultants.',
      'Send something in writing and we will see.',
    ],
    seen: 'In 20 of 100 calls the prospect said, one way or another, that they were not the right person. That came up more than any other reason. Ask who is, and for a number. 11 said they already had consultants or their own team.',
    taps: [
      { label: 'Not the right person', outcome: 'wrong_person' },
      { label: 'Already have consultants or a team', outcome: 'not_interested' },
      { label: 'Decided at head office or globally', outcome: 'not_interested' },
      { label: 'Not now, no time', outcome: 'follow_up' },
      { label: 'Not interested, no reason given', outcome: 'not_interested', ends: true },
      { label: 'Asked us not to call again', outcome: 'do_not_call', ends: true },
    ],
    wordsLabel: 'Their words (the reason)',
  },
  {
    number: 7,
    name: 'Next step',
    goal: 'Agree one concrete thing: what, on which channel, and when. A time they name is worth more than a time you propose.',
    mayHear: [
      'Send it on WhatsApp, this number.',
      'Call me Tuesday after 2.',
      'Speak to our operations head. I will text you his number.',
    ],
    seen: '38 of 100 prospects asked for something on WhatsApp or email. A yes to a document can be politeness; ask when you can talk about it.',
    taps: [
      { label: 'Document on WhatsApp', outcome: 'agreed_to_receive_report' },
      { label: 'Document on email', outcome: 'agreed_to_receive_report' },
      { label: 'Document plus a call at a set time', outcome: 'next_step_agreed' },
      { label: 'Call or meeting at a set time', outcome: 'next_step_agreed' },
      { label: 'Referred to a colleague', outcome: 'wrong_person' },
      { label: 'Nothing agreed' },
    ],
    wordsLabel: 'Their words (time, channel, name)',
  },
  {
    number: 8,
    name: 'Close',
    goal: 'End the call clearly and record what happened: the outcome, the next step, and their words from stage 5.',
    mayHear: [
      'The line drops mid-sentence.',
      '"Thank you, thank you." A warm goodbye after a no is still a no.',
      '"Hold on one second..." and they do not come back.',
    ],
    seen: 'In 36 of 100 calls the outcome the caller logged was empty or did not match the call. All 10 calls logged as "do not call" were really something else.',
    taps: [
      { label: 'Clear goodbye' },
      { label: 'Line dropped' },
      { label: 'Put on hold, did not return' },
      { label: 'Warm goodbye after a no' },
    ],
    wordsLabel: 'Their words',
  },
]

export function stageByNumber(n) {
  return STAGES.find((s) => s.number === n)
}
