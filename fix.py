import re

with open('src/robo.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix the broken section
broken_pattern = r'window\.addEventListener\("mousedown", \(e\) => \{\n  if \(\!contextMenu \|\| contextMenu\.hidden\) return;\n  const target = e\.target as Node;\n  if \(\!contextMenu\.contains\(target\)\) \{\n  const quoteEl = document\.createElement\("span"\);'

fixed_str = """window.addEventListener("mousedown", (e) => {
  if (!contextMenu || contextMenu.hidden) return;
  const target = e.target as Node;
  if (!contextMenu.contains(target)) {
    contextMenu.hidden = true;
  }
});

// Quote Logic
import quotesData from "./quotes.json";
const speechBubble = document.querySelector<HTMLDivElement>("#speech");
let quoteTimeout: number | null = null;
let quoteOffset = 0; // State for skipping the daily quote

function showQuote() {
  if (!speechBubble) return;
  if (!canvas) return; // TS safety
  
  const validQuotes = quotesData.quotes.filter((q: any) => 
    q.author && 
    q.author.toLowerCase() !== "unknown" && 
    q.author.trim() !== "" &&
    q.quote.length <= 100 // Enforce compact quotes
  );
  
  // Calculate days since epoch to lock the quote to the calendar day
  const daysSinceEpoch = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
  const quoteIndex = (daysSinceEpoch + quoteOffset) % validQuotes.length;
  const dailyQuote = validQuotes[quoteIndex];
  
  // Create DOM nodes for typewriter effect
  const fullQuote = \\""\\`;
  speechBubble.innerHTML = "";

  const quoteEl = document.createElement("span");"""

content = re.sub(broken_pattern, fixed_str, content)
content = content.replace("\\", "") # Fix template literal

with open('src/robo.ts', 'w', encoding='utf-8') as f:
    f.write(content)
