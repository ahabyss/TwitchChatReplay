var browserBackend = require('browserBackend');
var extensionSettings = require('extensionSettings');
var StayDown = require('staydown');

var jsonID = null;
var showJSON = null;
var epJSON = [];
var currentShow;   //0 based indexed
var currentSeason; //1 based indexed because you think of season 1 as being the first
var currentEp;     //1 based indexed because you think of episode 1 as being the first
var showAlts;
var selectedAlts = []
var playing = false;

var VLCFile;
var VLCTime;
var VLCState;
var VLCPlaylist;

var containerTab;
var scrollChat;
var contPanel;
var chatLines;

var ddAltDiv;
var ddAltButton;
var ddAltMenuDiv

var panelButton;
var playButton;

var ddEpDiv;
var ddEpButton;
var ddEpMenuDiv;

var ddButton;
var ddMenuDiv;
var delayInput;

var settingsBTTVEmotes = null;
var settingsBTTVChannels = null;

var pauseTime = 0;
var delayTime = 0;
var skipTime = 0;
var timeStart = null;

var suburl = '40fbcba3-7765-4f14-a625-8577d92e830d';
var primeurl = 'a1dd5073-19c3-4911-8cb4-c464a7bc1510';
var modurl = '3267646d-33f0-4b17-b3df-f923a41db1d0';

var firstMsgTime = [];
var currentMsgTime = [];
var currentMsgData = [];

var chatDisplayLimit = 50;

var bttvEmotes = {};
var autolinker = null;

var VLCImmunity = false;

function init() {
    promises = [];
    var settingsPromise = extensionSettings.getSettings();
    var getJSONLocalURLPromise = browserBackend.sendMessageToBackground({
        message: 'getShowsJSONURL'
    });
    
    promises.push(settingsPromise);
    promises.push(getJSONLocalURLPromise);
        
    Promise.all(promises).then(function(data) {    
        var settings = data[0];
        var jsonURL = data[1];
                
        settingsTimestamps = settings.timestamps;
        settingsEmojis = settings.emojis;
        settingsBadges = settings.badges;
        settingsBTTVEmotes = settings.bttvEmotes;
        settingsBTTVChannels = settings.bttvChannelsList;
        settingsVLCPass = settings.vlcpass;
        settingsVLCEnabled = settings.vlcenabled;
        settingsEmoteFilterTable = settings.emoteFilterList;
        settingsEmoteFilterList = [];
        settingsNameHighlightList = settings.nameHighlightList;
                
        settingsNameHighlightHashTable = {};
        settingsNameHighlightList.forEach(function(i) {settingsNameHighlightHashTable[i]=true});
        
        settingsEmoteFilterTable.forEach(function(item) {
            if (item.type === 'Emote')
                settingsEmoteFilterList.push(item.value);
        });
        
        jsonID = jsonURL.substring(0, jsonURL.length-10);
        
        chatLoaded();
        loadShows(jsonURL);
        
        if (settingsVLCEnabled)
            VLCInit();
    });
    
    autolinker = new Autolinker({
        urls: true,
        email: true,
        twitter: false,
        phone: false,
        stripPrefix: false
    });
}

init();

function VLCInit() {
    req = new XMLHttpRequest();
    req.open('GET', 'http://127.0.0.1:8080/requests/status.json');
    req.setRequestHeader("Authorization", 'Basic ' + btoa(':' + settingsVLCPass));
   
    req.onload = function () { //put refresh button if the init doesn't work?
        if (req.status === 200) {
            VLCStatus = JSON.parse(req.response);

            VLCFile = VLCStatus.information.category.meta.filename;
            VLCTime = VLCStatus.time;
            VLCState = VLCStatus.state;
            
            if (VLCState === 'playing')
                VLCCommand('pl_forcepause');

            VLCFindShow();          
            VLCPlaylistGet();
            
            setTimeout(VLCUpdater, 500);
        } else {
            console.log('Error with VLC Init...');
            console.log(req.status);
            setTimeout(VLCInit, 500);
        }
    }
    
    req.send(null);
}

function VLCSetupShow() {
    timeStart = Date.now();
    pauseTime = VLCTime * 1000;
    
    if (VLCTime < showJSON[currentShow][3][currentEp - 1][0]) { //if VLC is pre-chat then move to chat start
        pauseTime = (showJSON[currentShow][3][currentEp - 1][0]) * 1000;
        VLCCommand('seek&val=' + Math.round(showJSON[currentShow][3][currentEp - 1][0]));
    }
    
    ddButton[0].classList.add('inactive');
    ddEpButton[0].classList.add('inactive');
    ddShowLockDiv[0].classList.remove('unlocked');
    ddEpLockDiv[0].classList.remove('unlocked');
    
    updateTimeDisplay();
}

function VLCFindShow() {
    regexRWBYShow = /([Rr]+[Ww]+[Bb]+[Yy])/
    regexRWBYSeason = /([Vv][Oo][Ll]|[Vv][Oo][Ll][Uu][Mm][Ee]|[Ss][Ee][Aa][Ss][Oo][Nn])(\s*)([-#:]*)(\s*)(\d{1,2})/
    regexRWBYEpi = /([Cc][Hh][Aa][Pp][Tt][Ee][Rr]|[Ee][Pp][Ii]|[Ee][Pp][Ii][Ss][Oo][Dd][Ee])(\s*)([-#:]*)(\s*)(\d{1,2})/

    var tempShow;
    var tempEp;
    var tempSeason;
    
    if (regexRWBYShow.test(VLCFile)) { //If we're playing RWBY
        seasonRes = regexRWBYSeason.exec(VLCFile);
        if (seasonRes === null) { //assume first season
            tempSeason = 1;
        } else {
            tempSeason = Number(seasonRes[5]);
        }
        
        epiRes = regexRWBYEpi.exec(VLCFile);       
        if (epiRes === null) {
            tempEp = 1;
            console.log('This should never happen, try to rename your files cleanly (i.e. RWBY Volume 1 Chapter 1 - blah)');
        } else {
            tempEp = Number(epiRes[5]);
        }
        
        var ind;
        if (showJSON.some(function(item, i) {ind = i; return item[0] === 'RWBY Vol ' + tempSeason})) {
            tempShow = ind;
        } else {
            console.log("This should never happen, couldn't find expected volume in data folder");
        }
    }

    setCurrentShow(tempShow);
    setCurrentEp(tempEp);
    
    VLCSetupShow();
}

function VLCCommand(command) { //pl_pause(play/pause toggle) seek&val= pl_next pl_forceresume pl_forcepause pl_stop
  var vlcPassword = localStorage.getItem('vlcPassword');
  var password = vlcPassword;
  var req = new XMLHttpRequest();
  req.open('GET', 'http://127.0.0.1:8080/requests/status.xml?command=' + command);
  req.setRequestHeader("Authorization", 'Basic ' + btoa(':' + settingsVLCPass));
  req.send();
}

function VLCUpdater() {
    
    if (pauseTime > -1000) {
        req = new XMLHttpRequest();
        req.open('GET', 'http://127.0.0.1:8080/requests/status.json');
        req.setRequestHeader("Authorization", 'Basic ' + btoa(':' + settingsVLCPass));
       
        req.onload = function () {
            if (req.status === 200) {
                VLCStatus = JSON.parse(req.response);

                tempFile = VLCStatus.information.category.meta.filename;
                tempTime = VLCStatus.time;
                tempState = VLCStatus.state;
                
                if (false && (tempState != VLCState)) { //user play/paused in VLC
                    if ((tempState === 'playing' || tempState === 'paused') && (VLCState === 'playing' || VLCState === 'paused')) {  //if we went from playing/paused to playing/paused (not other states)
                        if (tempState === 'playing' || playing === true) { //only time we don't playpause is if VLC is now paused and we are paused (the other cross scenario should never happen)
                            console.log('forcing playpause VLC');
                            playPause();
                            VLCState = tempState;
                        } else {
                            console.log("no state change because VLC is playing or TCR is paused");
                        }
                    } else {
                        console.log("no state change because VLC was or is not (playing or paused)");
                    }
                }
                
                if (false && (tempFile != VLCFile)) { //user changed file in VLC
                    console.log('forcing VLC find show');
                    VLCFindShow();
                }

                if (false && (Math.abs(tempTime - VLCTime) > 2)) { //Time is out of sync (because user seeked in VLC or VLC is playing)
                    //if Math.abs((Math.floor((pauseTime + Date.now() - timeStart)/1000)) - tempTime)
                
                    console.log('loading btw haHAA');
                
                    loadEpisodeJSONs(); //needed in case user seeked backwards
                
                    timeStart = Date.now();
                    pauseTime = tempTime * 1000;
                    updateTimeDisplay();
                }
                
                VLCTime = tempTime; //update the time we think VLC is at
            }
        };
        
        req.send(null);
    }
    
    setTimeout(VLCUpdater, 500);
}

function VLCPlaylistGet() {
    req = new XMLHttpRequest();
    req.open('GET', 'http://127.0.0.1:8080/requests/playlist.json');
    req.setRequestHeader("Authorization", 'Basic ' + btoa(':' + settingsVLCPass));
   
    req.onload = function () {
        if (req.status === 200) {
            VLCPlaylistTemp = JSON.parse(req.response);

            VLCPlaylist = VLCPlaylistTemp.children[0].children;
        }
    };

    req.send(null);
}

function chatLoaded() {

    document.title = 'Twitch Chat Replay';
    containerTab = $(document.body).addClass('ember-application');
    
    if (settingsTimestamps === false) containerTab.append($('<style>').html('.timestamp{display: none}'));
    
    var emberView = $('<div>').addClass('ember-view TCR-ember-view');
    var emberChatContainer = $('<div>').addClass('pos-fixed top-0 right-0 bottom-0 left-0 ember-chat-container');
    var emberChat = $('<div>').addClass('qa-chat ember-chat roomMode ember-view');
    var emberView2 = $('<div>').addClass('ember-view');
    var emberChatRoom = $('<div>').addClass('chat-room');
    var emberView3 = $('<div>').addClass('ember-view');
    scrollChat = $('<div>').addClass('scroll chat-messages js-chat-messages showTimestamps showModIcons showAutoModActions');
    contPanel = $('<div>').addClass('chat-interface js-chat-interface-wrapper').attr('id', 'TCR-panel');
    var scrollContent = $('<div>').addClass('tse-scroll-content').css({'right': '0px', 'width': '400px', 'height': '439px'});
    var tseContent = $('<div>').addClass('tse-content');
    var chatDisplay = $('<div>').addClass('chat-display ember-view');
    chatLines = $('<ul>').addClass('chat-lines');
   
    var ddDiv = $('<div>').addClass('TCR-dropdown');
    ddButton = $('<button>').addClass('TCR-ddButton button').text('Anime Title').attr('id', 'TCR-ddButtonShows');
    ddMenuDiv = $('<div>').addClass('TCR-ddMenu').attr('id', 'TCR-ddMenuShows');
    ddShowLockDiv = $('<div>').addClass('TCR-lock unlocked').attr('id', 'TCR-ddShowLockDiv').html('🔒');
    
    ddEpDiv = $('<div>').addClass('TCR-dropdownEp');
    ddEpButton = $('<button>').addClass('TCR-ddEpButton button inactive').text('Ep X').attr('id', 'TCR-ddEpButton');
    ddEpMenuDiv = $('<div>').addClass('TCR-ddEpMenu').attr('id', 'TCR-ddEpMenu');
    ddEpLockDiv = $('<div>').addClass('TCR-lock unlocked').attr('id', 'TCR-ddEpLockDiv').html('🔒');
    
    ddAltDiv = $('<div>').addClass('inactive').attr('id', 'TCR-ddAltDiv')
    ddAltButton = $('<button>').addClass('TCR-ddAltButton button').text('Alts').attr('id', 'TCR-ddAltButton');
    ddAltMenuDiv = $('<div>').attr('id', 'TCR-ddAltMenuDiv');
    
    panelButton = $('<button>').addClass('button TCR-panelButton').attr('id', 'TCR-panelButton');
    playButton = $('<button>').addClass('button TCR-playButton inactive').attr('id', 'TCR-playButton');
    
    seekBarDivWrap = $('<div>').addClass('inactive').attr('id', 'TCR-seekBarDivWrap');
    seekBarDiv = $('<div>').attr('id', 'TCR-seekBarDiv');
    seekBarDivBarPre = $('<div>').attr('id', 'TCR-seekBarDivBarPre');
    seekBarDivBar = $('<div>').attr('id', 'TCR-seekBarDivBar');
    seekBarDivTime = $('<div>').attr('id', 'TCR-seekBarDivTime').text('');
    
    inputsDiv = $('<div>').attr('id', 'TCR-inputsDiv');
    
    delayDiv = $('<div>');  
    delayInput = $('<input>').addClass('inactive').attr('id', 'TCR-delayInput').attr('disabled', '').attr('value', 'delay');
    delayLabel = $('<span>').addClass('inactive').attr('id', 'TCR-delayLabel').text('0 sec');
   
    
    
    contPanel.append(panelButton);
    contPanel.append(ddDiv);
     ddDiv.append(ddButton);
     ddDiv.append(ddMenuDiv);
     ddDiv.append(ddShowLockDiv);
    contPanel.append(ddEpDiv);
     ddEpDiv.append(ddEpButton);    
     ddEpDiv.append(ddEpMenuDiv);
     ddEpDiv.append(ddEpLockDiv);
    contPanel.append(playButton);
    contPanel.append(ddAltDiv);
     ddAltDiv.append(ddAltButton);
     ddAltDiv.append(ddAltMenuDiv);
    
    contPanel.append(seekBarDivWrap);
     seekBarDivWrap.append(seekBarDiv);
      seekBarDiv.append(seekBarDivBarPre);
      seekBarDiv.append(seekBarDivBar);
      seekBarDiv.append(seekBarDivTime);
    
    inputsDiv.append(delayDiv);
     delayDiv.append(delayInput);
     delayDiv.append(delayLabel);
    
    contPanel.append(inputsDiv);
    
    containerTab.append(emberView);
    emberView.append(emberChatContainer);
    emberChatContainer.append(emberChat);
    emberChat.append(emberView2);
    emberView2.append(emberChatRoom);
    emberChatRoom.append(emberView3);
    emberView3.append(scrollChat);
    emberView3.append(contPanel);
    scrollChat.append(scrollContent);
    scrollContent.append(tseContent);
    tseContent.append(chatDisplay);
    chatDisplay.append(chatLines);
    
    ddButton[0].addEventListener('click', function() {ddShowsMenuClick(this);});
    ddEpButton[0].addEventListener('click', function() {ddEpMenuClick(this);});
    ddAltButton[0].addEventListener('click', function() {ddAltMenuClick(this);});
    
    panelButton[0].addEventListener('click', function() {generalButtonClick(this);});
    playButton[0].addEventListener('click', function() {generalButtonClick(this);});
    
    seekBarDiv[0].addEventListener('click', function(e) {seekBarClick(e, this);});
    
    delayInput.on('keyup', function (e) {
        if (e.keyCode === 13)
            updateDelay();
    });
    
    if (settingsBTTVEmotes === true)
        loadBTTVEmotes(settingsBTTVChannels);
    
    staydown = new StayDown({
    target: scrollContent.get(0),
    interval: 500000,
    callback: function(event) {
        switch (event) {
            case 'release':
                userScrolling = true;
                break;
            case 'lock':
                userScrolling = false;
                break;
        }
    }
    });
}

function populateShows() {
    for (i = 0; i < showJSON.length; i++) {
        ddMenuItemTemp = document.createElement('div');
        ddMenuItemTemp.id = 'ddMenuShowsItem'+i.toString();
        ddMenuItemTemp.innerHTML = showJSON[i][0];
        ddMenuDiv[0].appendChild(ddMenuItemTemp);
        ddMenuItemTemp.addEventListener('click', function() {ddShowsMenuClick(this);});
    }
}

function populateEpisodes(epMenu) {
    for (i = 0; i < showJSON[currentShow][1]; i++) {
        ddEpMenuItemTemp = document.createElement('div');
        ddEpMenuItemTemp.id = 'ddEpMenuItem'+i.toString();
        ddEpMenuItemTemp.innerHTML = 'Ep '+(i+1).toString();
        epMenu.appendChild(ddEpMenuItemTemp);
        ddEpMenuItemTemp.addEventListener('click', function() {ddEpMenuClick(this);});
    }
}

function populateAlts() {
    if (showAlts > 1) {
        for (i = 0; i < showAlts; i++) {
            ddAltMenuItemTemp = document.createElement('div');
            ddAltMenuItemTemp.classList.add('TCR-ddAltMenuItem');
            ddAltMenuItemTemp.id = 'ddAltMenuItem'+i.toString();
            ddAltMenuItemTemp.innerHTML = showJSON[currentShow][2][i][1];
            ddAltMenuDiv[0].appendChild(ddAltMenuItemTemp);
            ddAltMenuItemTemp.addEventListener('click', function() {ddAltMenuClick(this);});
        }
        ddAltMenuDiv[0].childNodes[0].classList.add('selected');
    } else {
        ddAltMenuDiv[0].innerHTML = 'None';
    }
}

function loadShows(jsonURL) {
    loadJSON(function(response) {showJSON = JSON.parse(response);}, jsonURL); //index:0-name, 1-numofep, 2-short
    populateShows();
}

function loadEpisodeJSONs() {
    for (i = 0; i < showAlts; i++) { //for each alt
        loadJSON(function(response) {epJSON[i] = JSON.parse(response);}, jsonID + showJSON[currentShow][2][i][0] + currentEp.toString() + '.json');
        currentMsgTime[i] = epJSON[i].index.shift(); //other way i could do alternate eps is by putting each in the same json, but each msg has a var identifiying it as being in X alt.... hmm
        currentMsgData[i] = epJSON[i].data.shift();
        firstMsgTime[i] = currentMsgTime[i];
    }
}

function reloadJSONs() {
    for (i = 0; i < showAlts; i++) { //for each alt
        loadJSON(function(response) {epJSON[i] = JSON.parse(response);}, jsonID + showJSON[currentShow][2][i][0] + currentEp.toString() + '.json');
        
        currentMsgTime[i] = epJSON[i].index.shift();
        currentMsgData[i] = epJSON[i].data.shift();
        firstMsgTime[i] = currentMsgTime[i];
    }
}

function ddShowsMenuClick(element) { //Handle clicks on the shows dropdown menu, if its the main button show the menu, if its a menu item select the item
    switch (element.id) {
        case 'TCR-ddButtonShows': {
            if (ddButton[0].classList.contains('inactive') === false) {
                ddMenuDiv[0].classList.toggle("show");
                raisePanel();
                resetPlayback();
            }
            break;
        }
        default: {
            var tempShow;
            found = showJSON.some(function(item, i) {tempShow = i; return item[0] === element.innerText}); //currentShow = showJSON.indexOf(function(item, i) {return item[0] === element.innerText});
            
            setCurrentShow(tempShow);
            setCurrentEp(1); //default to 1st episode
            break;
        }
    }
}

function setCurrentShow(argShow) {    
    currentShow = argShow;

    ddButton[0].innerHTML = ddMenuDiv[0].childNodes[currentShow].innerHTML; 

    ddEpButton[0].classList.remove('inactive');
    playButton[0].classList.remove('inactive');
    
    seekBarDivWrap[0].classList.remove('inactive');
    ddAltDiv[0].classList.remove('inactive');
    
    delayInput[0].classList.remove('inactive');
    delayLabel[0].classList.remove('inactive');
    delayInput[0].removeAttribute('disabled');
    
    while (ddEpMenuDiv[0].hasChildNodes()) {ddEpMenuDiv[0].removeChild(ddEpMenuDiv[0].lastChild);}
    populateEpisodes(ddEpMenuDiv[0]);
    
    showAlts = showJSON[currentShow][2].length;//gotta be sure to make the others single showings conform to this alt array
    selectedAlts = [0];
    
    while (ddAltMenuDiv[0].hasChildNodes()) {ddAltMenuDiv[0].removeChild(ddAltMenuDiv[0].lastChild);}
    populateAlts();
    //showJSON[currentShow][3][currentEp - 1][0], intro dur: (this value is the timestamp when we begin to have chat data)
    //showJSON[currentShow][3][currentEp - 1][1], this value is the timestamp when chat data is ended for this episode
}

function setCurrentEp(argEp) {
    currentEp = argEp;
    
    ddEpButton[0].innerHTML = 'Ep ' + currentEp; 

    skipTime = showJSON[currentShow][3][currentEp - 1][0];
    seekBarDivBarPre[0].style.width = 100 * (showJSON[currentShow][3][currentEp - 1][0]) / (showJSON[currentShow][3][currentEp - 1][1]) + '%';
    
    loadEpisodeJSONs();
}

function ddEpMenuClick(element) { //Handle clicks on the episodes dropdown menu, if its the main button show the menu, if its a menu item select the item
    switch (element.id) {
        case 'TCR-ddEpButton': {
            if (ddEpButton[0].classList.contains('inactive') === false) {
                ddEpMenuDiv[0].classList.toggle("show"); 
                resetPlayback();
                raisePanel();
            }
            break;
        }
        default: {
            var tempEp = Number(element.innerHTML.substring(3));
            setCurrentEp(tempEp);
            break;
        }
    }
}

function ddAltMenuClick(element) { //Handle clicks on the alt broadcasts dropdown menu
    switch (element.id) {
        case 'TCR-ddAltButton': {
            if (ddAltDiv[0].classList.contains('inactive') === false) {
                ddAltMenuDiv[0].classList.toggle("show"); 
                //resetPlayback(); 
                raisePanel();
            }
            break;
        }
        default: {
            var val = Number(element.id.substring(13));
            
            if (selectedAlts.some(function(item, i) {ind = i; return item === val}))
                selectedAlts.splice(ind, 1);
            else
                selectedAlts.push(val);
            
            ddAltMenuDiv[0].childNodes[val].classList.toggle('selected');
            break;
        }
    }
}

function seekBarClick(e, element) {
    clickX = e.offsetX;
    maxWidth = seekBarDiv[0].clientWidth;
    secs = Math.floor((clickX / maxWidth) * Math.floor(showJSON[currentShow][3][currentEp - 1][1]));
    
    if (settingsVLCEnabled) {
        VLCCommand('seek&val=' + secs);
        VLCTime = secs;
    }
    
    loadEpisodeJSONs();
    
    timeStart = Date.now();
    pauseTime = secs * 1000;
    updateTimeDisplay();
}

function togglePanel() {
    panelButton[0].classList.toggle('panelButtonToggle');
    contPanel[0].classList.toggle('panelToggle');
    scrollChat[0].classList.toggle('panelToggle');
}

function raisePanel() {
    panelButton[0].classList.remove('panelButtonToggle');
    contPanel[0].classList.remove('panelToggle');
    scrollChat[0].classList.remove('panelToggle');
}

function lowerPanel() {
    panelButton[0].classList.add('panelButtonToggle');
    contPanel[0].classList.add('panelToggle');
    scrollChat[0].classList.add('panelToggle');
}

function resetPlayback() {
    playing = false;
    chatLines.find('.chat-line:lt(' + chatLines.find('.chat-line').length + ')').remove();
    playButton[0].classList.remove('pause');
    playButton[0].classList.remove('next');
    timeStart = Date.now();
    seekBarDivBar[0].style.width = '0%';
    seekBarDivTime[0].innerHTML = '';
    pauseTime = 0;
}

function updateDelay() {
    delayInputValue = Number(delayInput[0].value);
    if (isNaN(delayInputValue) === false) {
        delayTime = delayInputValue;
        delayInput[0].value = 'delay';
    }
    delayLabel[0].innerText = delayTime + ' sec';
}

function playPause() {
    if (playButton[0].classList.contains('inactive') === false) {
        
        if (playButton[0].classList.contains('next') === true) {
            //ddEpButton[0].innerHTML = ddEpButton[0].innerHTML.substring(0, 3) + (++currentEp);
            //loadEpisodes();
            //resetPlayback();
            //playPause();
        } else {
            seekBarDiv[0].classList.remove('inactive');
            playButton[0].classList.toggle('pause');
            playing = !playing;
            
            if (playing === true) {
                lowerPanel();
                delayInput[0].setAttribute('disabled', '');
            
                timeStart = Date.now();
                startPlaying();
                staydown.interval = 50;

            } else {
                delayInput[0].removeAttribute('disabled');
                pauseTime += Date.now() - timeStart;
                staydown.interval = 1000000;              
            }
        }
    }
}

function playPauseSendVLC() {
    if (playButton[0].classList.contains('inactive') === false) {        
        if (playButton[0].classList.contains('next') === false) {
            if (playing === true) {
                VLCCommand('pl_forceresume');
                VLCState = 'playing';
            } else {
                VLCCommand('pl_forcepause');
                VLCState = 'paused';
            }
        }
    }
}

function generalButtonClick(element) {
        switch (element.id) {
        case 'TCR-playButton': {
            playPause();
            if (settingsVLCEnabled) {
                playPauseSendVLC();
            }
            break;
        }
        case 'TCR-panelButton': {
            togglePanel();
            break;
        }
    }
}

function formatmmss(timeSec) {
    var secs = (timeSec % 60).toString();
    return Math.floor(timeSec/60).toString() + ':' + '0'.repeat(2-secs.length) + secs
}

function updateTimeDisplay() {
    seekBarDivBar[0].style.width = 100 * (Math.floor((pauseTime + Date.now() - timeStart)/1000)) / (showJSON[currentShow][3][currentEp - 1][1]) + '%';
    seekBarDivTime[0].innerHTML = formatmmss(Math.floor((pauseTime + Date.now() - timeStart)/1000)) + ' / ' + formatmmss(Math.floor(showJSON[currentShow][3][currentEp - 1][1]));
}

function startPlaying() {
    if (playing === true) {
        updateTimeDisplay()
        
        while (true) {
            if (selectedAlts.every(function f(alt) { //for every selected alt index
                if ((pauseTime + Date.now() - timeStart) - (currentMsgTime[alt] - firstMsgTime[alt]) >= 2000 + delayTime * 1000 + skipTime * 1000) { //if this message is more than 2 seconds before NOW just skip it
                    currentMsgTime[alt] = epJSON[alt].index.shift();
                    currentMsgData[alt] = epJSON[alt].data.shift();
                } else if ((pauseTime + Date.now() - timeStart) - (currentMsgTime[alt] - firstMsgTime[alt]) >= 0 + delayTime * 1000 + skipTime * 1000) { //if this message occurs before NOW then show the msg
                    chatLines.append(formatChatMessageTCR(currentMsgData[alt], currentMsgTime[alt] - firstMsgTime[alt] + skipTime * 1000));
                    currentMsgTime[alt] = epJSON[alt].index.shift();
                    currentMsgData[alt] = epJSON[alt].data.shift();
                } else //if this message is in the future just wait for next time
                    return true;
            })) {
                break;
            }
        }
        
        if (settingsVLCEnabled && (((pauseTime + Date.now() - timeStart)/1000) - showJSON[currentShow][3][currentEp - 1][1] > 0.0)) { //if we are 0.5 sec past the ep cutoff point, then load next ep stuff
            console.log('skipping to next ep (VLC)');
            
            pauseTime = -10000; //forces no action until VLCNextPause
            
            playPause();
            setCurrentEp(currentEp + 1);
            
            VLCCommand('pl_next');
            
            //Set the VLC vars:
            VLCState = 'playing';
            VLCTime = 0;
            
            var ind;
            if (found = VLCPlaylist.some(function(item, i) {ind = i; return item.name === VLCFile})){
                VLCFile = VLCPlaylist[ind + 1].name;
            } else {
                console.log("Error: couldn't find file in playlist, make the playlist simpler and be sure file names have no strange characters");
            }
            
            setTimeout(VLCNextPause, 200);
        } else {
            setTimeout(startPlaying, 200);
        }
        
        /*if (selectedAlts.every(function t(alt){return epJSON[alt].index.length === 0 && currentMsgTime[alt] === undefined;})) { //if we reached the end of the chat messages for all alts
            playPause();
            
            if (currentEp < showJSON[currentShow][1])
                playButton[0].classList.toggle('next');
        }*/
        
        if (!userScrolling) {
            var numberOfChatMessagesDisplayed = chatLines.find('.chat-line').length;
            if (numberOfChatMessagesDisplayed >= chatDisplayLimit) {
                chatLines.find('.chat-line:lt(' + Math.max(numberOfChatMessagesDisplayed - chatDisplayLimit, 10) + ')').remove();
            }
        }
    }
}

function VLCNextPause() {
    VLCSetupShow();
    playPause();
    //playPauseSendVLC();
}

function formatChatMessageTCR(messageData, time) {

    name = messageData[0];
    color = messageData[1];
    msg = messageData[2];
    
    argBadges = messageData[6];
    
    var line = $('<li>').addClass('message-line chat-line ember-view');
    var div = $('<div>');
    
    if (name === 'twitchnotify') {
        line.addClass('admin');
        var timespan;
        var badges;
        var from;
        var colon;
    } else {   
        var timespan = $('<span>').addClass('timestamp float-left').text(formatmmss(Math.floor(time/1000)));
        var badges = $('<span>').addClass('float-left badges');
        var from = $('<span>').addClass('from').css({'color': color}).text(name);
        var colon = $('<span>').addClass('colon').text(':');
    }
    
    if (name in settingsNameHighlightHashTable) {
        line.addClass('TCRHighlight');
    }
    
    if (name === 'ohbot') {
        argBadges.push(true);
    }
    
    var message = $('<span>').addClass('message');
    
    if (msg.substring(0, 4) === "/me ") {
        line.addClass('action');
        msg = msg.substring(4);
        message.css({ 'color': color });
    }
    
    var messageHTML = textFormatter(msg, messageData[3], messageData[4], messageData[5]);
    message.html(messageHTML);

    if (name === '_TCRMSG') {
        if (msg === 'SNACK TIME')
            line.addClass('tcrmsg snacks');
        else
            line.addClass('tcrmsg fin');
        
        div.addClass('tcrmsgdiv');
        
        timespan.addClass('tcrmsg');
        from.addClass('tcrmsg');
        colon.addClass('tcrmsg');
    
        message.addClass('tcrmsg');
    } else {
        if (settingsBadges === true && name != 'twitchnotify') 
            applyMessageBadges(argBadges, badges);
    }
    
    div.append(timespan).append(' ').append(badges).append(' ').append(from).append(colon).append(' ').append(message);
    line.append(div);
    
    return line;
}

function textFormatter(text, ttvG, btvG, ttvC) {
    var messageParts = replaceTwitchEmoticonsByRanges(text, ttvG, btvG, ttvC);
    
    // further split parts by spaces
    var parts = [];
    messageParts.forEach(function(part) {
        if(Array.isArray(part)) return parts.push(part);

        parts = parts.concat(part.split(' '));
    });
    messageParts = parts;

    // handles third party emotes, escaping, and linkification
    for(var i = 0; i < messageParts.length; i++) {
        var part = messageParts[i];

        if (settingsBTTVEmotes === true) 
            part = replaceBTTVEmoticons(part);
        
        if (settingsEmojis === true) 
            part = replaceEmoji(part);
        
        //These two check if its already been adjusted (if string or not):
        part = replaceMentions(part);        
        part = escapeAndLink(part);

        part = Array.isArray(part) ? part[0] : part;
        messageParts[i] = part;
    }

    return messageParts.join(' ');
};

function replaceMentions(part) {
    if (typeof part !== 'string') return part;
        
    if (part[0] === '@') {
        return [$('<span>').addClass('mentioning').text(part)[0].outerHTML];
    }
    else
        return part;
};

function replaceEmoji(part) {
    if (typeof part !== 'string') return part;
    
    ret = part;
    twemoji.parse(part, {'callback': 
        function(iconID, options) {
            ret = ret.replace(twemoji.convert.fromCodePoint(iconID), $('<img>').attr({
                src: ''.concat(options.base, options.size, '/', iconID, options.ext)
            }).addClass('emoticon bttv-emoji')[0].outerHTML)
        }
    });

    if (ret !== part)
        return [ret];
    else
        return part;
};

function escapeAndLink(part) {
  if (typeof part !== 'string') return part;

  return autolinker.link(part.replace(/&/g, '&amp;').replace(/</g,'&lt;').replace(/>/g, '&gt;'));
};


function replaceBTTVEmoticons(part) {
    if (typeof part !== 'string') return part;

    var codeWithoutSymbols = part.replace(/(^[~!@#$%\^&\*\(\)]+|[~!@#$%\^&\*\(\)]+$)/g, '');

    var emote = null;
    if (bttvEmotes.hasOwnProperty(part)) {
        emote = bttvEmotes[part];
    } else if (bttvEmotes.hasOwnProperty(codeWithoutSymbols)) {
        emote = bttvEmotes[codeWithoutSymbols];
    } else {
        return part;
    }

    return [
        part.replace(emote.code, $('<img>').attr({
            src: 'https:'+emote['1x'],
            srcset: 'https:'+emote['2x'] + ' 2x',
            alt: emote.code,
            title: emote.code
        }).addClass('emoticon')[0].outerHTML)
    ];
};

function pushAfterFilter(emotesToReplace, part, emote) {
    if (settingsEmoteFilterList.length === 0)
        emotesToReplace.push(emote);
    else if (settingsEmoteFilterList.includes(part) === false)
        emotesToReplace.push(emote);
}

function replaceTwitchEmoticonsByRanges(text, ttvG, btvG, ttvC) {
    if (!ttvG && !btvG && !ttvC) return [ text ];

    var emotesToReplace = [];

    ttvG.forEach(function(emote) {
        var emoteRangeBegin = emote[1][0]
        var emoteRangeEnd = emote[1][1]
        pushAfterFilter(emotesToReplace, substringUnicode(text, emoteRangeBegin, emoteRangeEnd + 1), {id: emote[0], begin: emoteRangeBegin, end: emoteRangeEnd, type: 'ttvG'});
    });
    
    if (settingsBTTVEmotes === true) {
        btvG.forEach(function(emote) {
            var emoteRangeBegin = emote[1][0]
            var emoteRangeEnd = emote[1][1]
            pushAfterFilter(emotesToReplace, substringUnicode(text, emoteRangeBegin, emoteRangeEnd + 1), {id: emote[0], begin: emoteRangeBegin, end: emoteRangeEnd, type: 'btvG'});
        });
    }
        
    ttvC.forEach(function(emote) {
        var emoteRangeBegin = emote[1][0]
        var emoteRangeEnd = emote[1][1]
        pushAfterFilter(emotesToReplace, substringUnicode(text, emoteRangeBegin, emoteRangeEnd + 1), {id: emote[0], begin: emoteRangeBegin, end: emoteRangeEnd, type: 'ttvC'});
    });

    emotesToReplace.sort(function(x, y) {return y.begin - x.begin;});

    var messageParts = [];

    emotesToReplace.forEach(function(emote) {
        var emoteText = substringUnicode(text, emote.begin, emote.end + 1)

        // Unshift the end of the message (that doesn't contain the emote)
        messageParts.unshift(slice_lautis(text, emote.end + 1, 9999));

        if (emote.type === 'ttvG' || emote.type === 'ttvC') {
            // Unshift the emote HTML (but not as a string to allow us to process links, escape html, and other emotes)
            var imageBaseUrl = 'https://static-cdn.jtvnw.net/emoticons/v1/' + emote.id;
            messageParts.unshift([
                $('<img>').attr({
                    src: imageBaseUrl + '/1.0',
                    srcset: imageBaseUrl + '/2.0 2x',
                    alt: emoteText,
                    title: emoteText
                }).addClass('emoticon')[0].outerHTML
            ]);
        } else if (emote.type === 'btvG') {
            var imageBaseUrl = 'https://cdn.betterttv.net/emote/' + emote.id;
            messageParts.unshift([
                $('<img>').attr({
                    src: imageBaseUrl + '/1x',
                    srcset: imageBaseUrl + '/2x 2x',
                    alt: emote.code,
                    title: emote.code
                }).addClass('emoticon')[0].outerHTML
            ]);
        }

        // Splice the unparsed piece of the message
        text = slice_lautis(text, 0, emote.begin);
    });

    // Unshift the remaining part of the message (that contains no Twitch emotes)
    messageParts.unshift(text);

    return messageParts;
};



function charAt_lautis(string, index) {
  var first = string.charCodeAt(index);
  var second;
  if (first >= 0xD800 && first <= 0xDBFF && string.length > index + 1) {
    second = string.charCodeAt(index + 1);
    if (second >= 0xDC00 && second <= 0xDFFF) {
      return string.substring(index, index + 2);
    }
  }
  return string[index];
}

function slice_lautis(string, start, end) {
  var accumulator = "";
  var character;
  var stringIndex = 0;
  var unicodeIndex = 0;
  var length = string.length;

  while (stringIndex < length) {
    character = charAt_lautis(string, stringIndex);
    if (unicodeIndex >= start && unicodeIndex < end) {
      accumulator += character;
    }
    stringIndex += character.length;
    unicodeIndex += 1;
  }
  return accumulator;
}

function toNumber_lautis(value, fallback) {
  if (value === undefined) {
    return fallback;
  } else {
    return Number(value);
  }
}

function substringUnicode(string, start, end) {
  var realStart = toNumber_lautis(start, 0);
  var realEnd = toNumber_lautis(end, string.length);
  if (realEnd == realStart) {
    return "";
  } else if (realEnd > realStart) {
    return slice_lautis(string, realStart, realEnd);
  } else {
    return slice_lautis(string, realEnd, realStart);
  }
}





function buildBadge() {
  return $('<div>').addClass('float-left').addClass('badge');
};

function applyMessageBadges(badgeData, badges) {
    if (badgeData.length > 3) {
        var badgeContent = buildBadge().addClass('mod').prop('title', 'Moderator')
            .css('background-image', 'url(https://static-cdn.jtvnw.net/badges/v1/' + modurl + '/1)');
        badges.append(badgeContent).append(' ');
    }
    
    if (badgeData[2]) {
        var badgeContent = buildBadge().addClass('subscriber').prop('title', 'Subscriber')
            .css('background-image', 'url(https://static-cdn.jtvnw.net/badges/v1/' + suburl + '/1)');
        badges.append(badgeContent).append(' ');
    }
    
    if (badgeData[0]) {
        var badgeContent = buildBadge().addClass('turbo').prop('title', 'Twitch Turbo');
        badges.append(badgeContent).append(' ');
    } else if (badgeData[1]) {
        var badgeContent = buildBadge().addClass('prime').prop('title', 'Twitch Prime')
            .css('background-image', 'url(https://static-cdn.jtvnw.net/badges/v1/' + primeurl + '/1)');
        badges.append(badgeContent).append(' ');
    }
}

function loadBTTVEmotes(channels) {
    bttvEmotes = {};
    var endpointsList = [];
    channels.forEach(function(channel) {endpointsList.push('channels/' + encodeURIComponent(channel))});
    endpointsList.forEach(function(endpoint) {
        $.getJSON('https://api.betterttv.net/2/' + endpoint).done(function(data) {
            data.emotes.forEach(function(emote) {
                bttvEmotes[emote.code] = {
                    restrictions: emote.restrictions,
                    code: emote.code,
                    id: emote.id,
                    '1x': data.urlTemplate.replace('{{id}}', emote.id).replace('{{image}}','1x'),
                    '2x': data.urlTemplate.replace('{{id}}', emote.id).replace('{{image}}','2x')
                };
            });
        });
    });
};

window.onclick = function(event) {
    if (!event.target.matches('.TCR-ddButton')) {
        ddMenuDiv[0].classList.remove('show');
    }
    if (!event.target.matches('.TCR-ddEpButton')) {
        ddEpMenuDiv[0].classList.remove('show');
    }
    if (!event.target.matches('#TCR-ddAltButton') && !event.target.matches('.TCR-ddAltMenuItem')) {
        ddAltMenuDiv[0].classList.remove('show');
    }
}

function loadJSON(callback, path) {   
    var xobj = new XMLHttpRequest();
	xobj.overrideMimeType("application/json");
    xobj.open('GET', path, false); // Replace 'my_data' with the path to your file
    xobj.onreadystatechange = function () {
          if (xobj.readyState == 4 && xobj.status == "200") {
            // Required use of an anonymous callback as .open will NOT return a value but simply returns undefined in asynchronous mode
            callback(xobj.responseText);
          }
    };
    xobj.send(null);  
}