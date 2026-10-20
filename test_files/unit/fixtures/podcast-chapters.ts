/**
 * Chapter-parser fixture corpus (#1374, TEST-002).
 *
 * Each entry is a trimmed excerpt of a real episode description. Only the
 * timestamp lines and a few lines of surrounding prose are kept, so the
 * fixture still exercises the markup and separators each show uses.
 *
 * The four feeds named in the issue come first; the rest were sampled from
 * the live feeds on 2026-10-20. Entries with an empty `expected` list are
 * negative cases: prose timestamps, runtime lines, or no timestamps at all.
 */
export interface ChapterFixture {
  /** Human-readable feed name. */
  feed: string;
  /** Feed URL the excerpt came from. */
  url: string;
  /** Trimmed description excerpt. */
  excerpt: string;
  /** Episode duration used for the parse, when the case needs one. */
  duration?: number;
  /** Expected chapters, in order. */
  expected: Array<{ start: number; title: string }>;
}

export const CHAPTER_FIXTURES: ChapterFixture[] = [
  {
    feed: "Dwarkesh Podcast",
    url: "https://apple.dwarkesh-podcast.workers.dev/feed.rss",
    excerpt: `<p>New episode with military historian <a href="https://example.com/si">Si Sheppard</a>.</p><p>The conquests of the Aztec and Inca empires might be the most shocking events in human history.</p><p><strong>Timestamps</strong></p><p>(00:00:00) - Cortés's conquest of the Aztecs</p><p>(00:22:39) - Pizarro's conquest of the Inca</p><p>(00:26:59) - Explaining Conquistador military superiority</p><p>(01:07:47) - Why didn't the Aztecs/Incas adapt better to European warfare?</p> <br/><br/>This is a public episode.`,
    expected: [
      { start: 0, title: "Cortés's conquest of the Aztecs" },
      { start: 1359, title: "Pizarro's conquest of the Inca" },
      { start: 1619, title: "Explaining Conquistador military superiority" },
      {
        start: 4067,
        title: "Why didn't the Aztecs/Incas adapt better to European warfare?",
      },
    ],
  },
  {
    feed: "Science Vs",
    url: "https://feeds.megaphone.fm/sciencevs",
    excerpt: `Have you been puzzled by your poos? You're not alone!

Find our transcript here: ScienceVs

In this episode, we cover:

Time stamp and titles for each chapter (first chapter must start at 00:00, minimum 3 chapters)

(00:00) Intro&nbsp;

(02:45) What does it mean to reach "poophoria"??

(04:37) Living in a poo-forward household

(11:06) That sinking feeling in your stomach

(49:42) Oddball questions

This episode was produced by Ekedi Fausther-Keeys and Wendy Zukerman.`,
    expected: [
      { start: 0, title: "Intro" },
      { start: 165, title: 'What does it mean to reach "poophoria"??' },
      { start: 277, title: "Living in a poo-forward household" },
      { start: 666, title: "That sinking feeling in your stomach" },
      { start: 2982, title: "Oddball questions" },
    ],
  },
  {
    feed: "FSMI",
    url: "https://feeds.megaphone.fm/FSMI7575968096",
    excerpt: `Ryan Serhant is a real estate broker, founder of SERHANT., and star of Bravo's Million Dollar Listing New York.

Enjoy

-----

(00:00) Intro

(02:19) Get Chosen Before You're Established

(10:03) Why Sellers Should Take Acting Classes

(16:26) Why Buyers Resist Your Pitch

(21:39) How to Use Google Alerts to Land Leads

-----

Follow Ryan Serhant: https://www.instagram.com/ryanserhant

-----

+ Members get the longer version of this episode.`,
    expected: [
      { start: 0, title: "Intro" },
      { start: 139, title: "Get Chosen Before You're Established" },
      { start: 603, title: "Why Sellers Should Take Acting Classes" },
      { start: 986, title: "Why Buyers Resist Your Pitch" },
      { start: 1299, title: "How to Use Google Alerts to Land Leads" },
    ],
  },
  {
    feed: "The Amp Hour",
    url: "https://theamphour.com/feed/podcast/",
    excerpt: `<p>Eric Pan is the founder and CEO of <a href="https://www.seeedstudio.com/">Seeed Studio</a>, an open-source hardware platform.</p>
<h3 id="timeline">Timeline</h3>
<ul>
<li>Chris welcomes <a href="https://www.linkedin.com/in/ericspan/">Eric Pan</a>, founder and CEO of <a href="https://www.seeedstudio.com/">Seeed Studio</a>, to discuss open-source hardware, the evolution of Shenzhen, and the emerging robotics ecosystem. (00:00:15)</li>
<li>Eric recounts founding Seeed Studio in Shenzhen in 2008, starting with just two people committed to open hardware. (00:02:45)</li>
<li>Eric discusses his background working at <a href="https://www.intel.com/">Intel</a> and how Seeed&rsquo;s earliest projects supported artists and interactive installations needing custom electronics. (00:05:30)</li>
<li>How hardware startups, suppliers, and maker spaces collaborate, share resources, and exchange talent across Shenzhen. (00:13:00)</li>
</ul>`,
    expected: [
      {
        start: 15,
        title:
          "Chris welcomes Eric Pan, founder and CEO of Seeed Studio, to discuss open-source hardware, the evolution of Shenzhen, and the emerging robotics ecosystem.",
      },
      {
        start: 165,
        title:
          "Eric recounts founding Seeed Studio in Shenzhen in 2008, starting with just two people committed to open hardware.",
      },
      {
        start: 330,
        title:
          "Eric discusses his background working at Intel and how Seeed’s earliest projects supported artists and interactive installations needing custom electronics.",
      },
      {
        start: 780,
        title:
          "How hardware startups, suppliers, and maker spaces collaborate, share resources, and exchange talent across Shenzhen.",
      },
    ],
  },
  {
    feed: "Huberman Lab",
    url: "https://feeds.megaphone.fm/hubermanlab",
    excerpt: `Read the episode show notes at hubermanlab.com.

Timestamps

(00:00:00) Jared Diamond

(00:02:51) Leadership, Prophets; Hitler, WWII

(00:13:45) Sponsors: Rorra &amp; Eight Sleep

(00:25:36) Religious Leaders, Jesus &amp; Leadership, Organizers

(00:49:59) Taxonomy of Leadership`,
    expected: [
      { start: 0, title: "Jared Diamond" },
      { start: 171, title: "Leadership, Prophets; Hitler, WWII" },
      { start: 825, title: "Sponsors: Rorra & Eight Sleep" },
      {
        start: 1536,
        title: "Religious Leaders, Jesus & Leadership, Organizers",
      },
      { start: 2999, title: "Taxonomy of Leadership" },
    ],
  },
  {
    feed: "Lex Fridman Podcast",
    url: "https://lexfridman.com/feed/podcast/",
    excerpt: `<p><b>OUTLINE:</b><br />
(00:00) &#8211; Introduction<br />
(01:07) &#8211; Sponsors, Comments, and Reflections<br />
(08:10) &#8211; Crisis in Psychiatry<br />
(1:03:26) Malaria &#8220;Cure&#8221; for Syphilis<br />
(2:06:35) Freud and Psychoanalysis<br />
(3:33:18) Future of Psychiatry</p>`,
    expected: [
      { start: 0, title: "Introduction" },
      { start: 67, title: "Sponsors, Comments, and Reflections" },
      { start: 490, title: "Crisis in Psychiatry" },
      { start: 3806, title: "Malaria “Cure” for Syphilis" },
      { start: 7595, title: "Freud and Psychoanalysis" },
      { start: 12798, title: "Future of Psychiatry" },
    ],
  },
  {
    feed: "99% Invisible",
    url: "https://feeds.simplecast.com/BqbsxVfO",
    excerpt: `<p>The story of New Year's Eve in (2:46) <a href="https://example.com/times-square">Times Square</a>, and how a quiet group of unelected Manhattan property owners used the holiday to transform the neighborhood.</p><p>Subscribe to SiriusXM Podcasts+ to listen to new episodes ad-free.</p>`,
    expected: [],
  },
  {
    feed: "Acquired",
    url: "https://feeds.transistor.fm/acquired",
    excerpt: `<p>Seinfeld, which ended three decades ago, has been watched by 72 million Americans so far THIS YEAR.</p><p><strong>Sponsors:</strong></p><ul><li><a href="https://link.acquired.fm/sierra">Sierra</a></li><li><a href="https://link.acquired.fm/claude">Anthropic</a></li></ul><p><strong>Links:</strong></p><ul><li><a href="https://www.acquired.fm/email">Sign up for email updates</a></li></ul><p>This episode runs 45:00.</p>`,
    expected: [],
  },
  {
    feed: "Darknet Diaries",
    url: "https://feeds.megaphone.fm/darknetdiaries",
    excerpt: `<p>This is a story about a disturbing cyber attack. A breach so invasive it blurred the line between digital crime and psychological torture.</p><p>Get more from Joe <a href="https://linktr.ee/joetidy"><strong>linktr.ee/joetidy</strong></a>.</p><h3>Sponsors</h3><p>Support for this show comes from <strong>ThreatLocker</strong>, a Zero Trust Endpoint Protection Platform.</p>`,
    expected: [],
  },
  {
    feed: "The Rest Is History",
    url: "https://feeds.megaphone.fm/GLT1412515089",
    excerpt: `<p>The Habsburgs were the ultimate dynasty. In this episode we explore how they married their way across Europe and ended up ruling an empire on which the sun never set.</p><p>Listen to the whole series in the app.</p>`,
    expected: [],
  },
  {
    feed: "FSMI (duration cut)",
    url: "https://feeds.megaphone.fm/FSMI7575968096",
    excerpt: `(00:00) Intro

(02:19) Get Chosen Before You're Established

(10:03) Why Sellers Should Take Acting Classes

(16:26) Why Buyers Resist Your Pitch`,
    duration: 1000,
    expected: [
      { start: 0, title: "Intro" },
      { start: 139, title: "Get Chosen Before You're Established" },
      { start: 603, title: "Why Sellers Should Take Acting Classes" },
      { start: 986, title: "Why Buyers Resist Your Pitch" },
    ],
  },
];
