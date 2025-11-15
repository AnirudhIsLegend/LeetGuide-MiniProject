document.addEventListener("DOMContentLoaded", () => {
  const saveBtn = document.getElementById("saveKey");
  const input = document.getElementById("apiKey");

  // Load saved key when popup opens
  chrome.storage.local.get("geminiApiKey", data => {
    if (data.geminiApiKey) {
      input.value = data.geminiApiKey;
    }
  });

  // Save key when button clicked
  saveBtn.addEventListener("click", () => {
    const key = input.value.trim();

    if (!key) {
      alert(" Please enter a valid Gemini API key.");
      return;
    }

    chrome.storage.local.set({ geminiApiKey: key }, () => {
      alert(" Gemini API key saved successfully!");
      console.log("Saved API key:", key);
    });
  });
});
