var $ = require('jquery');
var browserBackend = require('browserBackend');
var extensionSettings = require('extensionSettings');

var settingsVLCPass;

function init() {
    configureOpenSettingsButton();
    setOpenChatDialogEvent();
    
    promises = [];
    var settingsPromise = extensionSettings.getSettings();
    
    promises.push(settingsPromise);
        
    Promise.all(promises).then(function(data) {    
        var settings = data[0];
 
        settingsVLCPass = settings.vlcPass;
        settingsVLCEnabled = settings.vlcEnabled;
        
        if (settingsVLCEnabled) VLCInit();
    });    
}

function setOpenChatDialogEvent() {
    openChatDialogButton = $('input.openChatDialogButton[type="button"]');
    openChatDialogButton.click(function (e) {
        if (e.target.value === 'Open Chat Popup') {
            
        } else {
            extensionSettings.setSettings({vlcEnabled: 'false'});
        }
        
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

notificationId = null;
function desktopnotifications(e) {
    var options = {"message": e, "type": "basic", "title": "VLC Connection Error", "iconUrl": chrome.runtime.getURL('assets/images/TCRIcon128.png')};
    if (notificationId) {
        if (chrome.notifications.update) {
            return chrome.notifications.update(notificationId, options, function () {});
        }
    }
    return chrome.notifications.create(options, function (id) {notificationId = id});
}

function VLCInit() {
    openChatDialogButton = $('input.openChatDialogButton[type="button"]');
    vlcinfo = $('#vlcinfo');
    
    req = new XMLHttpRequest();
    req.open('GET', 'http://127.0.0.1:8080/requests/status.json');
    req.setRequestHeader("Authorization", 'Basic ' + btoa(':' + settingsVLCPass));
    req.onload = function () {
        if (req.status === 200) {
            
        } else {
            openChatDialogButton[0].value = 'Continue Anyway';
            vlcinfo[0].innerHTML = 'Continuing will disable the VLC option';
            desktopnotifications("The password is incorrect! Please ensure the password in the options is the same as in VLC.");
        }
    };
    
    req.onerror = function (e) {
        openChatDialogButton[0].value = 'Continue Anyway';
        vlcinfo[0].innerHTML = 'Continuing will disable the VLC option';
        desktopnotifications("An error has occurred! Please make sure VLC media player is running on your computer.");
    };
    
    req.send(null);
}

document.addEventListener('DOMContentLoaded', init, false);