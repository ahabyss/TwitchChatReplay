var $ = require('jquery');
var browserBackend = require('browserBackend');
var extensionSettings = require('extensionSettings');

var settingsVLCEnabled;
var settingsVLCPass;
var loadStatus;
var notificationId = null;

function init() {
    
    initButtonEvents();
    
    var promises = [];
    var settingsPromise = extensionSettings.getSettings();
    
    promises.push(settingsPromise);
        
    Promise.all(promises).then(function(data) {
        var settings = data[0];
 
        settingsVLCPass = settings.vlcPass;
        settingsVLCEnabled = settings.vlcEnabled;
        
        if (settingsVLCEnabled) {
            setButtonStatus(2);
            VLCInit();
        } else {
            setButtonStatus(0);
        }
    });    
}

function setButtonStatus(type) { //0 good, 1 bad, 2 loading
    if (type === 0) {
        loadStatus = 0;
        $('#TCRLock')[0].classList.add('unlocked');
        $('#openChatButton')[0].classList.remove('disabled');
        
        if (settingsVLCEnabled) {
            $('#vlcInfo')[0].innerHTML = 'VLC Connected.';
        } else {
            $('#vlcInfo')[0].innerHTML = 'VLC Disabled.';
        }
        
    } else if (type === 1) {
        loadStatus = 1;
        $('#TCRLock')[0].classList.add('unlocked');
        $('#openChatButton')[0].classList.remove('disabled');
        
        $('#vlcInfo')[0].innerHTML = 'Error. Continuing will disable the VLC option.';
    } else if (type === 2) {
        loadStatus = 2;
        $('#TCRLock')[0].classList.remove('unlocked');
        $('#openChatButton')[0].classList.add('disabled');
        
        $('#vlcInfo')[0].innerHTML = 'VLC Enabled<br>loading VLC...';
    }
}

function initButtonEvents() {
    
    $('#openSettingsButton').click(function(e) {
        browserBackend.openOptionsPage();
    });
    
    $('#openChatButton').click(function (e) {
        if (loadStatus == 0) {
            chrome.windows.create({'url': chrome.extension.getURL('chatPopup.html'), 'width': 356, 'height': 700, 'type': 'popup'}, function(window) {
                close();
            });
        } else if (loadStatus == 1) {
            extensionSettings.setSettings({vlcEnabled: 'false'});
            chrome.windows.create({'url': chrome.extension.getURL('chatPopup.html'), 'width': 356, 'height': 700, 'type': 'popup'}, function(window) {
                close();
            });
        }
    });
}

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
    var req = new XMLHttpRequest();
    req.open('GET', 'http://127.0.0.1:8080/requests/status.json');
    req.setRequestHeader("Authorization", 'Basic ' + btoa(':' + settingsVLCPass));
    req.onload = function () {
        if (req.status === 200) {
            setButtonStatus(0);
        } else {
            setButtonStatus(1);
            desktopnotifications("The password is incorrect! Please ensure the password in the options is the same as in VLC.");
        }
    };
    
    req.onerror = function (e) {
        setButtonStatus(1);
        desktopnotifications("An error has occurred! Please make sure VLC media player is running on your computer.");
    };
    
    req.send(null);
}

document.addEventListener('DOMContentLoaded', init, false);