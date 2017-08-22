var browserBackend = require('browserBackend');
var extensionSettings = require('extensionSettings');

var chatDialogURL = "https://www.twitch.tv/nonexistantCR/chat?popout="
var contentScript = '/contentscript.js';
var contentCSS = 'contentscript/css/style.css';
var injectedCSS = false;

function init() {
    setOpenChatDialogLoadedEvent();
    browserBackend.listenForMessages(respondToMessage);
}

function setOpenChatDialogLoadedEvent() {
    chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
        if (tab.url === chatDialogURL) {    
            if (injectedCSS === false) {
                chrome.tabs.insertCSS(tabId, {'file': contentCSS}, function() {});
                injectedCSS = true;
            }        
            
            if (changeInfo.status === 'complete') {
                browserBackend.injectScriptToTab(contentScript, tab);
                injectedCSS = false;
            }
        }
    });   
}

function respondToMessage(message, sender, responseCallback) {
    if (message.message === 'getShowsJSONURL') {
        responseCallback(chrome.extension.getURL('/data/shows.json'));
    }
}

init();