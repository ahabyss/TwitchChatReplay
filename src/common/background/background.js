var browserBackend = require('browserBackend');
var ID_CONTEXT_MENU_ITEM_VLC_ONLINE = "ID_CONTEXT_MENU_ITEM_VLC_ONLINE";

function init() {
    browserBackend.listenForMessages(respondToMessage);
}

function respondToMessage(message, sender, responseCallback) {
    if (message.message === 'getShowsJSONURL') {
        responseCallback(chrome.extension.getURL('/data/shows.json'));
    }
}

init();