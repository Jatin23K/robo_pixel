import re

with open('src/robo.ts', 'r', encoding='utf-8') as f:
    content = f.read()

pattern = re.compile(r'function updateContext\(\) \{.*?^\}', re.MULTILINE | re.DOTALL)

new_code = """function updateContext() {
  if (isManualExpressionMode) return;

  const pName = osContext.active_process_name.toLowerCase();
  const title = osContext.active_window_title.toLowerCase();

  const isMatch = (str: string, keywords: string[]) => keywords.some(k => str.includes(k));
  
  const setActivity = (key: string) => {
    // Uses the same data as the manual override menu
    const mapping = ACTIVITY_MAP[key];
    if (mapping) {
      state.baseAction = mapping.baseAction;
      state.expression = mapping.expression;
      state.props = mapping.props;
      state.accessories = mapping.accessories;
    }
  };
  
  if (osContext.idle_time_ms > 300000) { 
     return setActivity("sleeping");
  }

  // 1. Gaming
  if (isMatch(pName, ["steam", "epic", "riot", "valorant", "csgo", "league", "minecraft", "roblox", "overwatch", "genshin", "dota"])) {
     return setActivity("gaming");
  }
  
  // 2. Music / Audio
  if (isMatch(pName, ["spotify", "itunes", "music", "foobar", "winamp"])) {
     return setActivity("music");
  }

  // 3. Coding / Development
  if (isMatch(pName, ["code", "cursor", "idea", "pycharm", "webstorm", "phpstorm", "rider", "devenv", "sublime", "nvim", "vim", "wezterm", "alacritty", "terminal"])) {
     return setActivity("coding");
  }

  // 4. Chat / Social
  if (isMatch(pName, ["discord", "slack", "teams", "whatsapp", "telegram", "zoom", "skype"])) {
     return setActivity("writing"); // Simulates typing/chatting
  }

  // 5. Browsers & Media
  if (isMatch(pName, ["chrome", "msedge", "brave", "firefox", "opera", "arc", "vivaldi", "safari"])) {
     if (isMatch(title, ["youtube", "twitch", "netflix", "prime", "hulu", "disney", "vimeo", "crunchyroll", "player", "movie", "tv"])) {
       return setActivity("watching");
     } else if (isMatch(title, ["docs", "notion", "obsidian", "word", "mail", "chat", "write"])) {
       return setActivity("writing");
     } else {
       return setActivity("browsing");
     }
  } 

  // Default Fallback
  setActivity("idle");
}"""

content = pattern.sub(new_code, content)

# Also need to move ACTIVITY_MAP above updateContext so it can be referenced.
map_pattern = re.compile(r'const ACTIVITY_MAP.*?\}\;', re.MULTILINE | re.DOTALL)
match = map_pattern.search(content)
if match:
    map_code = match.group(0)
    content = map_pattern.sub('', content) # remove from bottom
    # insert above updateContext
    content = content.replace('function updateContext() {', map_code + '\n\nfunction updateContext() {')

with open('src/robo.ts', 'w', encoding='utf-8') as f:
    f.write(content)
