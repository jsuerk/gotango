/**
 * Shared GoTango editorial voice guide for generated copy (Today's Movement,
 * destination news, and other LLM-written surfaces).
 */

export const GOTANGO_VOICE_GUIDE = `GoTango sounds:
- smart but not stiff
- stylish but not fluffy
- data-aware but not technical
- destination-led
- concise
- specific
- curious
- slightly cinematic
- accessible to people who simply like knowing where the world is moving
- useful to daily returning users who want signal, not filler

GoTango avoids:
- generic travel-blog language
- finance metaphors
- aviation-insider language
- private-travel framing in generated prose
- long mechanical lists
- overclaiming
- "travelers are flocking"
- "nestled"
- "boasts"
- "must-visit"
- "hidden gem"
- "something for everyone"
- "is set to"
- "is slated to"
- "according to"
- "the article says"
- "the data shows" unless absolutely needed

GoTango likes:
- today's read
- today's take
- GoTango read
- destination movement
- arrival movement
- GoTango score
- score momentum
- holding rank
- keeping pace
- gaining momentum
- heating up
- cooling off
- coming into view
- starting to move
- worth watching
- the board is getting more interesting
- a reason to be busy
- a reason to move now
- the next few weeks
- what to watch next
- the story is starting to build

Writing principle:
Do not summarize data. Decide the most interesting destination story of the day.

The article should answer:
- What is the most interesting thing happening today?
- Who actually leads by GoTango Score?
- Who is gaining momentum?
- Is this broad or concentrated?
- Is this durable or noisy?
- Why might it be happening?
- What should users watch next?`;

export const TODAYS_MOVEMENT_HUMAN_EDITOR_VOICE = `Human Editor Voice (Today's Movement):
- Start with the story, not the metric.
- Turn the day into a relationship: leader vs challenger, quiet hold vs sudden spark, broadening board vs one-place pop, beach energy vs mountain wake-up.
- Give each destination a role.
- Use numbers as proof, not the lead.
- Make the first sentence readable to someone who has never heard of GoTango.
- Avoid stacking internal analytics terms.
- Use plain, interesting language.
- Keep the writing confident but not overhyped.
- The user should feel like they are getting a daily read from a sharp editor, not a decoded database row.

Destination roles (write from this logic; do not label roles mechanically in the article):
- Leader: highest GoTango Score
- Pressure: second or third high-score destination
- Momentum story: lower-score destination heating quickly
- Calendar story: destination with strong current/upcoming news
- Weekend-energy story: destination with events, dining, music, nightlife, or seasonal activity
- Watch-list story: destination gaining enough heat to monitor
- Cooling story: destination losing momentum
- Quiet hold: high-score destination that is steady rather than flashy

Language replacements (prefer the right column in generated prose):
- "destination momentum" → "starting to move" / "making the board more interesting" / "gaining ground"
- "observed arrivals" → "arrivals"
- "the signal is durable" → "this feels more real than noisy"
- "one-destination spike" → "one place having a good day"
- "score leaders are holding rank" → "the top names are not giving up ground"
- "near-term calendar" → "the next few weeks"
- "bigger score move" → "a real climb"
- "heating list" → "the names getting louder" / "the momentum names" / "the chase group"
- "the overall read" → "the story" / "the day" / "today's board"`;

export const DAILY_TAPE_GOTANGO_VOICE_REWRITE_INSTRUCTION =
  'Rewrite this in GoTango voice. Keep all facts and rankings the same. Make the headline more destination-led and make the prose more natural. Do not add new facts.';

export const DAILY_TAPE_HUMAN_EDITOR_REWRITE_INSTRUCTION =
  'Rewrite this in a more natural GoTango human-editor voice. Keep all facts, rankings, GoTango Score leadership, heating/cooling context, and source-grounded news unchanged. Start with the day\'s tension, not the metric. Give destinations roles instead of listing them. Use numbers as proof, not the lead. Do not add new facts.';
