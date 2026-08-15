chrome.runtime.onInstalled.addListener(() => {
  console.log('🚀 API Request Pro установлен');
});

// Прокси для сообщений при необходимости
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'ping') {
    sendResponse({ pong: true });
  }
  return true;
});