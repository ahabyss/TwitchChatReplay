var $ = require('jquery');
var browserBackend = require('browserBackend');

var chatDialogURL = "https://www.twitch.tv/nonexistantCR/chat?popout="

function init() {
    configureOpenSettingsButton();
    setOpenChatDialogEvent();
}

function setOpenChatDialogEvent() {
    openChatDialogButton = $('input.openChatDialogButton[type="button"]');
    openChatDialogButton.click(function () {
        newWindow = chrome.windows.create({'url': chatDialogURL, 'width' : 356, 'type': 'popup'}, function(window) {
        });
        close();
    });
}

function configureOpenSettingsButton() {
    document.getElementById('openSettingsButton').addEventListener('click', function() {
        browserBackend.openOptionsPage();
    });
}

document.addEventListener('DOMContentLoaded', init, false);