var browserBackend = require('browserBackend');

function init() {
    browserBackend.listenForMessages(respondToMessage);
}

function respondToMessage(message, sender, responseCallback) {
    if (message.message === 'getShowsJSONURL') {
        responseCallback(chrome.extension.getURL('/data/shows.json'));
    }
}

init();