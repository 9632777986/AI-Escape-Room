// Declarative story scripts. Step types (all optional keys):
//  {scene: url, dim?}            change backdrop (fade + whoosh)
//  {stamp: 'TEXT'}               top-left timestamp / location stamp ('' hides)
//  {title: 'BIG', sub: 'small'}  title card
//  {line: 'text', pause: ms}     narration, typed one line at a time
//  {say: 'text', who: 'NAME', portrait: 'voss'|'ceo', pause: ms}   spoken dialogue
//  {phone: {name, sub}}          phone vibrates, incoming-call card, answer
//  {pause: ms} {fx: 'shake'|'flash'} {sfx: name} {music: track} {hidePortrait: true}
// Everything here is fictional. No real person is named or implied.
export const SCRIPTS = {
  prologue: [
    { music: 'tense' },
    { scene: 'static/img/title.jpg', dim: true },
    { pause: 900 },
    { stamp: 'FRIDAY 13 NOVEMBER 2026  /  22:41 CET' },
    { line: 'November 13, 2026. 22:41 CET.', pause: 1500 },
    { line: 'The building is almost empty.', pause: 1500 },
    { scene: 'static/img/office.jpg', dim: true },
    { stamp: 'FLOOR 14  /  EXECUTIVE OFFICE' },
    { line: 'One confidential file has disappeared.', pause: 1600 },
    { line: 'The security logs show an employee account was active shortly before the deletion.', pause: 1800 },
    { line: 'Your phone starts vibrating.', pause: 700, sfx: 'phone' },
    { fx: 'shake' },
    { phone: { name: 'Mara Voss', sub: 'Security Operations' } },
    { say: 'Investigator, you have thirty minutes. Find out what happened.', who: 'MARA VOSS  /  SECURITY OPERATIONS', portrait: 'voss', pause: 1600 },
    { say: 'The archive logged an export, then a deletion. Someone wants us to think we already know who did it.', who: 'MARA VOSS', portrait: 'voss', pause: 1500 },
    { say: 'Do not trust a display name. The logs tell you what an account did, not who was at the keyboard.', who: 'MARA VOSS', portrait: 'voss', pause: 1700 },
    { say: 'Search the office. Everything in there was left behind by somebody. I will be on the line.', who: 'MARA VOSS', portrait: 'voss', pause: 1300 },
    { sfx: 'info' },
    { hidePortrait: true },
    { pause: 500 },
    { title: 'THE FALL', sub: 'NIGHT OF THE EXPORT' },
    { pause: 1600 },
  ],

  room1: [
    { scene: 'static/img/office.jpg', dim: true },
    { stamp: 'FLOOR 14  /  EXECUTIVE OFFICE' },
    { sfx: 'door' },
    { line: 'The door seals behind you.', pause: 1100 },
    { line: 'A desk lamp is still on. A screen is still awake.', pause: 1300 },
    { line: 'Whoever was here left in a hurry.', pause: 1200 },
    { say: 'Start with whatever looks ordinary. The ordinary things are the ones people forget to hide.', who: 'MARA VOSS', portrait: 'voss', pause: 1200 },
    { hidePortrait: true },
  ],

  room2: [
    { scene: 'static/img/forensics.jpg', dim: true },
    { stamp: 'SECURITY OPERATIONS  /  DIGITAL FORENSICS LAB' },
    { sfx: 'door' },
    { line: 'Racks hum behind glass. Every light is a record of something.', pause: 1400 },
    { say: 'You are in. One device keeps showing up in the export window: LT-77.', who: 'MARA VOSS  /  RADIO', portrait: 'voss', pause: 1500 },
    { say: 'It is not in the asset registry. The account label on it is familiar. The fingerprint is not.', who: 'MARA VOSS  /  RADIO', portrait: 'voss', pause: 1500 },
    { say: 'Prove the device. Do not prove a person. Those are different claims.', who: 'MARA VOSS  /  RADIO', portrait: 'voss', pause: 1200 },
    { hidePortrait: true },
  ],

  win: [
    { music: 'success' },
    { scene: 'static/img/end_success.jpg', dim: false },
    { stamp: 'SATURDAY 14 NOVEMBER 2026  /  06:12 CET' },
    { sfx: 'success' },
    { line: 'Dawn over the campus. The sessions are revoked. The device is isolated.', pause: 1700 },
    { line: 'The evidence is sealed, hashed and logged.', pause: 1500 },
    { line: 'Nobody was blamed for what the logs could not prove.', pause: 1700 },
    { say: 'Account activity is not identity. You remembered that when it was easier to forget.', who: 'MARA VOSS', portrait: 'voss', pause: 1700 },
    { say: 'The review goes ahead at nine. Go home, Investigator.', who: 'MARA VOSS', portrait: 'voss', pause: 1400 },
    { hidePortrait: true },
    { title: 'CASE CLOSED', sub: 'THE FALL  /  FICTIONAL SIMULATION' },
  ],

  room3: [
    { scene: 'static/img/warroom.jpg', dim: true },
    { stamp: 'INCIDENT RESPONSE ROOM  /  DECISION POINT' },
    { sfx: 'door' },
    { line: 'The wall is full of what you found.', pause: 1300 },
    { say: 'I need a decision, and I need it now. Is it contained?', who: 'THE CEO  /  FICTIONAL', portrait: 'ceo', pause: 1500 },
    { say: 'Report only what the evidence supports, Investigator. Not what is convenient. Not what is loud.', who: 'MARA VOSS', portrait: 'voss', pause: 1500 },
    { say: 'Stop the bleeding. Protect the evidence. Then we talk about who.', who: 'MARA VOSS', portrait: 'voss', pause: 1200 },
    { hidePortrait: true },
  ],
};
