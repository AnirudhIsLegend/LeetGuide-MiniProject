console.log("LeetGuide content script loaded ✅");



// Create the Ask AI button
const aiButton = document.createElement("button");
aiButton.innerText = "💡 Ask AI";
aiButton.id = "leetguide-ai-btn";
Object.assign(aiButton.style, {
  position: "fixed",
  bottom: "20px",
  left: "20px",
  zIndex: "9999",
  backgroundColor: "#007bff",
  color: "white",
  border: "none",
  borderRadius: "6px",
  padding: "10px 16px",
  cursor: "pointer",
  fontSize: "14px",
  boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
});
document.body.appendChild(aiButton);

// Create the chat container (hidden by default)
const chatContainer = document.createElement("div");
chatContainer.id = "leetguide-chat";
Object.assign(chatContainer.style, {
  position: "fixed",
  bottom: "70px",
  left: "20px",
  width: "450px",
  height: "550px",
  backgroundColor: "black",
  borderRadius: "8px",
  boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
  display: "none",
  flexDirection: "column",
  overflow: "hidden",
  zIndex: "10000",
});
chatContainer.innerHTML = `
  <div id="chatMessages" style="flex:1; padding:10px; overflow-y:auto; font-size:14px;"></div>
  <div style="display:flex; border-top:1px solid rgba(255, 255, 255, 0.2); background: rgba(0, 0, 0, 0.2);">
    <input id="chatInput" type="text" placeholder="Ask LeetGuide..." 
      style="flex:1; border:none; padding:10px; outline:none; background: transparent; color: white; font-size: 14px;">
    <button id="sendBtn" style="border:none; color:white; padding:10px 14px; cursor:pointer; font-size: 14px;">Send</button>
  </div>
`;
document.body.appendChild(chatContainer);

// Toggle chat visibility
aiButton.addEventListener("click", () => {
  chatContainer.style.display = chatContainer.style.display === "none" ? "flex" : "none";
});

// Fetch Gemini API key properly
async function getGeminiKey() {
  return new Promise(resolve => {
    chrome.storage.local.get("geminiApiKey", data => {
      if (data && data.geminiApiKey) resolve(data.geminiApiKey);
      else resolve(null);
    });
  });
}

// Get problem text (fallback if not found)
function getProblemText() {
  // 1. Try to get the problem title
  const titleEl = document.querySelector('div.text-title-large.font-semibold.text-text-primary');
  const title = titleEl ? titleEl.textContent.trim() : "Unknown Problem";

  // 2. Try to get the main problem description
  const descriptionEl = document.querySelector('div[data-track-load="description_content"]');
  const description = descriptionEl ? descriptionEl.innerText.trim() : "⚠️ Could not extract problem description.";

  // 3. Try to get all examples (if any)
  const examples = Array.from(document.querySelectorAll('strong.example'))
    .map(example => {
      const pre = example.closest('p')?.nextElementSibling?.outerText ?? "";
      return `${example.innerText}\n${pre}`;
    })
    .join("\n\n");

  // 4. Combine everything nicely
  return `${title}\n\n${description}\n\n${examples}`;
}

// Format AI response text for better readability
function formatResponse(text) {
  if (!text) return '';

  // First, protect code blocks by replacing them with placeholders
  const codeBlocks = [];
  let codeBlockIndex = 0;
  let formatted = text.replace(/```[\s\S]*?```/g, (match) => {
    const placeholder = `__CODE_BLOCK_${codeBlockIndex}__`;
    codeBlocks[codeBlockIndex] = match;
    codeBlockIndex++;
    return placeholder;
  });

  // Escape HTML to prevent XSS (except for placeholders)
  formatted = formatted
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Restore code blocks and format them
  codeBlocks.forEach((block, index) => {
    const placeholder = `__CODE_BLOCK_${index}__`;
    // Extract code from ```...``` format
    const codeMatch = block.match(/```(?:\w+)?\n?([\s\S]*?)```/);
    if (codeMatch) {
      const code = codeMatch[1].trim();
      formatted = formatted.replace(placeholder, 
        `<pre class="code-block"><code class="code-content">${code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>`);
    }
  });

  // Convert inline code (`...`) - but not inside code blocks
  formatted = formatted.replace(/`([^`\n]+)`/g, '<code class="inline-code">$1</code>');

  // Convert **bold** text (mark temporarily to avoid conflict with italic)
  formatted = formatted.replace(/\*\*([^*\n]+)\*\*/g, '**BOLD_START**$1**BOLD_END**');
  
  // Convert *italic* text (but not if it's part of **bold**)
  formatted = formatted.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
  
  // Restore bold markers to actual HTML
  formatted = formatted.replace(/\*\*BOLD_START\*\*/g, '<strong>');
  formatted = formatted.replace(/\*\*BOLD_END\*\*/g, '</strong>');

  // Split into paragraphs first (preserve code blocks)
  const parts = formatted.split(/(<pre[\s\S]*?<\/pre>)/g);
  const processedParts = parts.map(part => {
    if (part.startsWith('<pre')) {
      return part; // Keep code blocks as-is
    }
    
    // Convert numbered lists (1. item)
    part = part.replace(/^(\d+)\.\s+(.+)$/gm, '<li class="list-item">$2</li>');
    
    // Convert bullet lists (- item or * item at start of line)
    part = part.replace(/^[-*]\s+(.+)$/gm, '<li class="list-item">$1</li>');
    
    // Wrap consecutive list items
    part = part.replace(/(<li class="list-item">[^<]+<\/li>(?:\s*<li class="list-item">[^<]+<\/li>)*)/g, (match) => {
      // Check if it contains numbered items (check first item for number pattern)
      const firstItem = match.match(/<li class="list-item">(.+?)<\/li>/);
      if (firstItem && /^\d+\./.test(firstItem[1].trim())) {
        return `<ol class="numbered-list">${match}</ol>`;
      }
      return `<ul class="bullet-list">${match}</ul>`;
    });
    
    return part;
  });
  
  formatted = processedParts.join('');

  // Split into parts preserving code blocks
  const paraParts = formatted.split(/(<pre[\s\S]*?<\/pre>)/g);
  const processedParaParts = paraParts.map(part => {
    if (part.startsWith('<pre')) {
      return part; // Keep code blocks as-is
    }
    
    // Split by double line breaks for paragraphs
    const paragraphs = part.split(/\n\n+/);
    return paragraphs.map(para => {
      para = para.trim();
      if (!para) return '';
      // Don't wrap lists in paragraphs
      if (para.startsWith('<ol') || para.startsWith('<ul')) {
        return para;
      }
      // Check if it's just whitespace or empty after processing
      const textOnly = para.replace(/<[^>]+>/g, '').trim();
      if (!textOnly) return '';
      return `<p class="response-paragraph">${para}</p>`;
    }).filter(p => p).join('');
  });
  
  formatted = processedParaParts.join('');

  // Convert remaining single line breaks to <br> (but not in code blocks or existing HTML tags)
  formatted = formatted.replace(/\n/g, '<br>');
  
  // Remove <br> tags inside code blocks (they should preserve actual newlines)
  formatted = formatted.replace(/(<pre[\s\S]*?<code[^>]*>)([\s\S]*?)(<\/code>[\s\S]*?<\/pre>)/g, (match, start, code, end) => {
    const cleanedCode = code.replace(/<br>/g, '\n');
    return start + cleanedCode + end;
  });

  return formatted;
}


// Handle chat interaction
document.getElementById("sendBtn").addEventListener("click", async () => {
  const input = document.getElementById("chatInput");
  const messages = document.getElementById("chatMessages");
  const userMsg = input.value.trim();
  if (!userMsg) return;

  messages.innerHTML += `<div class="user-message"><div class="message-bubble">${userMsg}</div></div>`;
  input.value = "";

  const apiKey = await getGeminiKey();
  if (!apiKey) {
    messages.innerHTML += `<div class="system-message"><div class="message-bubble">⚠️ LeetGuide: Please add your Gemini API key in the popup.</div></div>`;
    console.warn("⚠️ No key found in storage");
    return;
  }

  // Combine question with problem text
  const prompt = `${getProblemText()}\n\nUser: ${userMsg}`;

  messages.innerHTML += `<div class="thinking-message"><i>Thinking...</i></div>`;

  try {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${apiKey}`,

    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }]
          }
        ]
      })
    }
  );

  const data = await response.json();
  console.log("Gemini API response:", data);

  if (data?.candidates && data.candidates.length > 0) {
    const aiText = data.candidates[0].content.parts
      .map(p => p.text)
      .join(" ");
    // Remove "Thinking..." message before adding response
    const thinkingMsg = messages.querySelector('.thinking-message');
    if (thinkingMsg) thinkingMsg.remove();
    // Format the response for better readability
    const formattedText = formatResponse(aiText);
    messages.innerHTML += `<div class="api-message"><div class="message-bubble">${formattedText}</div></div>`;
  } else if (data.error) {
    const thinkingMsg = messages.querySelector('.thinking-message');
    if (thinkingMsg) thinkingMsg.remove();
    messages.innerHTML += `<div class="system-message"><div class="message-bubble">⚠️ API Error: ${data.error.message}</div></div>`;
  } else {
    const thinkingMsg = messages.querySelector('.thinking-message');
    if (thinkingMsg) thinkingMsg.remove();
    messages.innerHTML += `<div class="system-message"><div class="message-bubble">⚠️ No valid response from Gemini.</div></div>`;
  }

  messages.scrollTop = messages.scrollHeight;
} catch (err) {
  const thinkingMsg = messages.querySelector('.thinking-message');
  if (thinkingMsg) thinkingMsg.remove();
  messages.innerHTML += `<div class="system-message"><div class="message-bubble">⚠️ Error: ${err.message}</div></div>`;
  console.error("Gemini fetch failed", err);
}
});
