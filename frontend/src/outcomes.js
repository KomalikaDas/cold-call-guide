// Same outcome words the backend and the database use.
export const OUTCOMES = [
  { key: 'next_step_agreed', label: 'Next step agreed', hint: 'A call, meeting, or document plus a set time', tone: 'good' },
  { key: 'agreed_to_receive_report', label: 'Will receive a document', hint: 'WhatsApp or email, no time fixed', tone: 'good' },
  { key: 'interested', label: 'Interested', hint: 'Said yes, nothing fixed', tone: 'good' },
  { key: 'follow_up', label: 'Call again', hint: 'They asked to be called back', tone: 'wait' },
  { key: 'call_again', label: 'Try the number again', hint: 'Bad line or language', tone: 'wait' },
  { key: 'wrong_person', label: 'Wrong person', hint: 'Not them, or not the right one', tone: 'neutral' },
  { key: 'moved_company', label: 'Moved company', hint: 'No longer there', tone: 'neutral' },
  { key: 'not_interested', label: 'Not interested', hint: 'They declined', tone: 'no' },
  { key: 'do_not_call', label: 'Do not call', hint: 'They asked not to be called', tone: 'no' },
]

export function outcomeLabel(key) {
  return OUTCOMES.find((o) => o.key === key)?.label ?? key
}

export function outcomeTone(key) {
  return OUTCOMES.find((o) => o.key === key)?.tone ?? 'neutral'
}
