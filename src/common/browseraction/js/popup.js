var $ = require('jquery');
var browserBackend = require('browserBackend');

function init() {
    configureOpenSettingsButton();
    setOpenChatDialogEvent();
}

function setOpenChatDialogEvent() {
    openChatDialogButton = $('input.openChatDialogButton[type="button"]');
    openChatDialogButton.click(function () {
        chrome.windows.create({'url': chrome.extension.getURL('chatPopup.html'), 'width': 356, 'type': 'popup'}, function(window) {
            close();
        });
    });
}

function configureOpenSettingsButton() {
    document.getElementById('openSettingsButton').addEventListener('click', function() {
        browserBackend.openOptionsPage();
    });
}

document.addEventListener('DOMContentLoaded', init, false);