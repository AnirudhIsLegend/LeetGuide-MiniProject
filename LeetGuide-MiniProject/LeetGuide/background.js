chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "GET_GEMINI_KEY") {
    chrome.storage.local.get("geminiApiKey", data => {
      sendResponse({ key: data.geminiApiKey || null });
    });
    return true; 
  }
});
