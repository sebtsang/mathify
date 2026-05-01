// background/service_worker.js
// Routes Gemini fetch requests from content scripts. Real implementation in H3.

chrome.runtime.onInstalled.addListener(() => {
  console.log("[mathify] installed");
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "mathify:ping") {
    sendResponse({ ok: true });
    return true;
  }
  return false;
});
