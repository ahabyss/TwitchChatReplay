var browserBackend = require('browserBackend');
var extensionSettings = require('extensionSettings');
var StayDown = require('staydown');

var eID = null; //Extension ID from URL
var showJSON = null; //Contains information on the playable anime
var epJSON = []; //Array of loaded chat arrays (based on alts)
var currentShow = null;   //0 based indexed
var currentEp;     //1 based indexed because you think of episode 1 as being the first
var selectedAlts = [];
var staydownChat = null;
var settingsArray = null;
var VLCInfo = [];

var autolinker = new Autolinker({urls: true, email: true, twitter: false, phone: false, stripPrefix: false});

var playedTime = 0; //playtime of current episode
var lastPlayUpdate = null;
var delayTime = 0;
var playing = false;

var badgeArray = [['bd444ec6-8f34-4bf9-91f4-af1e3428d80f', 'Turbo'], ['a1dd5073-19c3-4911-8cb4-c464a7bc1510', 'Twitch Prime'], ['40fbcba3-7765-4f14-a625-8577d92e830d', 'Subscriber'], ['3267646d-33f0-4b17-b3df-f923a41db1d0', 'Moderator'],
    [{'1':'73b5c3fb-24f9-4a82-a852-2f475b59411c', '100':'09d93036-e7ce-431c-9a9e-7044297133f2', '1000':'0d85a29e-79ad-4c63-a285-3acd2c66f2ba', '5000':'57cd97fc-3e9e-4c6d-9d41-60147137234e',
    '10000':'68af213b-a771-4124-b6e3-9bb6d98aa732', '100000':'96f0540f-aa63-49e1-a8b3-259ece3bd098', '1000000':'494d1c8e-c3b2-4d88-8528-baff57c9bd3f'}, 'cheer '], ['d97c37bd-a6f5-4c38-8f57-4e4bef88af34', 'Twitch Staff'],
    ['9384c43e-4ce7-4e94-b2a1-b93656896eba', 'Global Moderator'], ['d12a2e27-16f6-41d0-ab77-b780518f00a3', 'Verified'], ['9ef7e029-4cdf-4d4d-a0d5-e2b3fb2583fe', 'Twitch Admin'], ['5527c58c-fb7d-422d-b71b-f309dcb85cc1', 'Broadcaster']];

var regexEpi1 = /(?:ch|ep|epi|episode|chapter)[\s\-#:]*?(\d{1,2})[\s\-#:]+/i;
var regexEpi2 = /[\s\-#:]+?(\d{1,2})[\s\-#:]+/i;
    
function init() {
    var promises = [];
    var settingsPromise = extensionSettings.getSettings();
    var getJSONLocalURLPromise = browserBackend.sendMessageToBackground({
        message: 'getShowsJSONURL'
    });
    
    promises.push(settingsPromise);
    promises.push(getJSONLocalURLPromise);
        
    Promise.all(promises).then(function(data) {    
        settingsArray = data[0];
        var jsonURL = data[1];
        
        //additional settings to add to options panel
        settingsArray.chatDisplayLimit = 50;
        
        //Process some of the settings:
        settingsArray.nameHighlightHashTable = {};       
        settingsArray.nameHighlightList.forEach(function(item) {
            settingsArray.nameHighlightHashTable[item] = true;
        });
        
        settingsArray.emoteFilter = [];
        settingsArray.emoteFilterList.forEach(function(item) {
            if (item.type === 'Emote') {
                settingsArray.emoteFilter.push(item.value);
            }
        });
        
        if (settingsArray.bttvEmotes) {
            settingsArray.bttvEmotesDict = {};
            loadBTTVEmotes(settingsArray.bttvChannelsList, settingsArray.bttvEmotesDict);
        }
        
        eID = jsonURL.substring(0, jsonURL.length-10);
        
        initComplete();
        loadShows(jsonURL);
        
        if (settingsArray.vlcEnabled) {
            VLCInit();
        }
    });
}

init();

function VLCReq(argType, argOnLoad) {
    var req = new XMLHttpRequest();
    req.open('GET', 'http://127.0.0.1:8080/requests/' + argType);
    req.setRequestHeader("Authorization", 'Basic ' + btoa(':' + settingsArray.vlcPass));
    req.onload = function() {argOnLoad.apply(this, [req]);};
    req.send(null);
}

function VLCCommand(command, argOnLoad) { //pl_pause(play/pause toggle) seek&val= pl_next pl_forceresume pl_forcepause pl_stop
    VLCReq('status.json?command=' + command, argOnLoad);
}

function VLCInit() { 
    VLCReq('status.json', function(req) {
        if (req.status === 200) {
            var VLCStatus = JSON.parse(req.response);

            VLCInfo.file = VLCStatus.information.category.meta.filename;
            VLCInfo.time = VLCStatus.time;
            VLCInfo.state = VLCStatus.state;
            
            if (VLCInfo.state === 'playing')
                VLCCommand('pl_forcepause', function() {});

            VLCFindShow();          
            VLCPlaylistGet();
            
            setTimeout(VLCUpdater, 500);
        } else {
            console.log('Error with VLC Init...');
            console.log(req.status + ' - ' + req.statusText);
            setTimeout(VLCInit, 500);
        }
    });
}

function VLCPlaylistGet() {
    VLCReq('playlist.json', function(req) {
        if (req.status === 200) {
            VLCInfo.playlist = JSON.parse(req.response).children[0].children;
        }
    });
}

function VLCUpdater() {
    
    if (playedTime > -1000) {
        VLCReq('status.json', function(req) {
            if (req.status === 200) {
                var VLCStatus = JSON.parse(req.response);

                tempFile = VLCStatus.information.category.meta.filename;
                tempTime = VLCStatus.time;
                tempState = VLCStatus.state;
                
                /*if (false && (tempState != VLCInfo.state)) { //user play/paused in VLC
                    if ((tempState === 'playing' || tempState === 'paused') && (VLCInfo.state === 'playing' || VLCInfo.state === 'paused')) {  //if we went from playing/paused to playing/paused (not other states)
                        if (tempState === 'playing' || playing === true) { //only time we don't playpause is if VLC is now paused and we are paused (the other cross scenario should never happen)
                            console.log('forcing playpause VLC');
                            playPause(false);
                            VLCInfo.state = tempState;
                        } else {
                            console.log("no state change because VLC is playing or TCR is paused");
                        }
                    } else {
                        console.log("no state change because VLC was or is not (playing or paused)");
                    }
                }*/
                
                /*if (false && (tempFile != VLCInfo.file)) { //user changed file in VLC
                    console.log('forcing VLC find show');
                    VLCFindShow();
                }*/

                /*if (false && (Math.abs(tempTime - VLCInfo.time) > 2)) { //Time is out of sync (because user seeked in VLC or VLC is playing)
                    //if Math.abs((Math.floor((playedTime + Date.now() - timeStart)/1000)) - tempTime)
                
                    console.log('loading btw haHAA');
                
                    loadEpisodeJSONs(); //needed in case user seeked backwards
                
                    playedTime = tempTime * 1000;
                    updateTimeDisplay();
                }*/
                
                VLCInfo.time = tempTime; //update the time we think VLC is at
            }
        });
    }
    
    setTimeout(VLCUpdater, 500);
}

function VLCFindShow() {
    
    var tempShow = null;
    showJSON.some(function(show, ind) {
        tempShow = ind;
        return (new RegExp(show[4], 'i')).test(VLCInfo.file);
    }); 
           
    epRes = regexEpi1.exec(VLCInfo.file);
    if (epRes === null) {
        console.log('reverting to secondary ep regex');
        epRes = regexEpi2.exec(VLCInfo.file);
        if (epRes === null) {
            epRes = 1;
            console.log('This should never happen, try to rename your VLC files cleanly (i.e. <SHOW NAME> Season <X> Episode <X> - <TITLE>)');
        }
    } else {
        epRes = epRes[1];
    }
    
    setCurrentShow(tempShow);
    setCurrentEp(Number(epRes));
    resetPlayback(false);
    
    VLCSetupShow();
}

function VLCSetupShow() {
    playedTime = VLCInfo.time * 1000;
    
    if (showJSON[currentShow][3][currentEp - 1][0][1] == 1) { //its a skipped segment
        if (VLCInfo.time < showJSON[currentShow][3][currentEp - 1][0][0]) { //if VLC is pre-chat then move to chat start
            playedTime = (showJSON[currentShow][3][currentEp - 1][0][0]) * 1000;
            VLCCommand('seek&val=' + Math.round(showJSON[currentShow][3][currentEp - 1][0][0]), function() {});
        }
    }
    
    $('#TCR-ddShowButton')[0].classList.add('inactive');
    $('#TCR-ddEpButton')[0].classList.add('inactive');
    $('#TCR-ddShowLockDiv')[0].classList.remove('unlocked');
    $('#TCR-ddEpLockDiv')[0].classList.remove('unlocked');
    
    updateTimeDisplay();
}

function getCurrentEpLength() {
    return (showJSON[currentShow][3][currentEp - 1].map(function(value, index) {return value[0];})).reduce((a, b) => a + b, 0);
}

function divBarPres() {
    $('.TCR-seekBarDivBarPre').remove();
    
    for (var i = 0; i < showJSON[currentShow][3][currentEp - 1].length; i++) {
        if (showJSON[currentShow][3][currentEp - 1][i][1] == 1) {
            var seekBarDivBarPre = $('<div>').attr('class', 'TCR-seekBarDivBarPre');
            $('#TCR-seekBarDiv').prepend(seekBarDivBarPre);
            seekBarDivBarPre[0].style['margin-left'] = 100 * ((showJSON[currentShow][3][currentEp - 1].slice(0, i)).map(function(value, index) {return value[0];})).reduce((a, b) => a + b, 0) / getCurrentEpLength() + '%';
            seekBarDivBarPre[0].style.width = 100 * (showJSON[currentShow][3][currentEp - 1][i][0]) / getCurrentEpLength() + '%';
        }
    }
}

function initComplete() {

    document.title = 'Twitch Chat Replay';
    var containerTab = $(document.body).addClass('ember-application');
    var emberView = $('<div>').addClass('ember-view TCR-ember-view');
    var emberChatContainer = $('<div>').addClass('pos-fixed top-0 right-0 bottom-0 left-0 ember-chat-container');
    var emberChat = $('<div>').addClass('qa-chat ember-chat roomMode ember-view');
    var emberView2 = $('<div>').addClass('ember-view');
    var emberChatRoom = $('<div>').addClass('chat-room');
    var emberView3 = $('<div>').addClass('ember-view');
    var scrollChat = $('<div>').addClass('scroll chat-messages js-chat-messages showTimestamps showModIcons showAutoModActions').attr('id', 'TCR-scrollChat');
    var contPanel = $('<div>').addClass('chat-interface js-chat-interface-wrapper').attr('id', 'TCR-panel');
    var scrollContent = $('<div>').addClass('tse-scroll-content').css({'right': '0px', 'width': '400px', 'height': '439px'});
    var tseContent = $('<div>').addClass('tse-content');
    var chatDisplay = $('<div>').addClass('chat-display ember-view');
    var chatLines = $('<ul>').addClass('chat-lines').attr('id', 'TCR-chatLines');
   
    var ddShowDiv = $('<div>').attr('id', 'TCR-ddShowDiv');
    var ddShowButton = $('<button>').addClass('TCR-ddShowButton button').text('Anime Title').attr('id', 'TCR-ddShowButton');
    var ddShowMenuDiv = $('<div>').attr('id', 'TCR-ddShowMenuDiv');
    var ddShowLockDiv = $('<div>').addClass('TCR-lock unlocked').attr('id', 'TCR-ddShowLockDiv').html('🔒&#xfe0e;');
    
    var ddEpDiv = $('<div>').attr('id', 'TCR-ddEpDiv');
    var ddEpButton = $('<button>').addClass('TCR-ddEpButton button inactive').text('Ep X').attr('id', 'TCR-ddEpButton');
    var ddEpMenuDiv = $('<div>').attr('id', 'TCR-ddEpMenuDiv');
    var ddEpLockDiv = $('<div>').addClass('TCR-lock unlocked').attr('id', 'TCR-ddEpLockDiv').html('🔒&#xfe0e;');
    
    var ddAltDiv = $('<div>').addClass('inactive').attr('id', 'TCR-ddAltDiv')
    var ddAltButton = $('<button>').addClass('TCR-ddAltButton button').text('Alts').attr('id', 'TCR-ddAltButton');
    var ddAltMenuDiv = $('<div>').attr('id', 'TCR-ddAltMenuDiv');
    
    var panelButton = $('<button>').addClass('button TCR-panelButton').attr('id', 'TCR-panelButton');
    var playButton = $('<button>').addClass('button TCR-playButton inactive').attr('id', 'TCR-playButton');
    
    var seekBarDivWrap = $('<div>').addClass('inactive').attr('id', 'TCR-seekBarDivWrap');
    var seekBarDiv = $('<div>').attr('id', 'TCR-seekBarDiv');
    var seekBarDivBar = $('<div>').attr('id', 'TCR-seekBarDivBar');
    var seekBarDivTime = $('<div>').attr('id', 'TCR-seekBarDivTime').text('');
    
    var darkButton = $('<button>').addClass('button TCR-darkButton').attr('id', 'TCR-darkButton').html('🌙&#xfe0e;');
    
    var inputsDiv = $('<div>').attr('id', 'TCR-inputsDiv');
    
    var delayDiv = $('<div>').attr('id', 'TCR-delayDiv');  
    var delayInput = $('<input>').addClass('inactive').attr('id', 'TCR-delayInput').attr('disabled', '').attr('value', 'delay');
    var delayLabel = $('<span>').addClass('inactive').attr('id', 'TCR-delayLabel').text('0 sec');
    
    contPanel.append(panelButton);
    contPanel.append(ddShowDiv.append(ddShowButton, ddShowMenuDiv, ddShowLockDiv));
    contPanel.append(ddEpDiv.append(ddEpButton, ddEpMenuDiv, ddEpLockDiv));
    contPanel.append(playButton);
    contPanel.append(ddAltDiv.append(ddAltButton, ddAltMenuDiv));
    contPanel.append(seekBarDivWrap.append(seekBarDiv.append(seekBarDivBar, seekBarDivTime)));
    contPanel.append(inputsDiv.append(darkButton, delayDiv.append(delayInput, delayLabel)));
    
    containerTab.append(emberView.append(emberChatContainer.append(emberChat.append(emberView2.append(emberChatRoom.append(emberView3.append(scrollChat.append(scrollContent.append(tseContent.append(chatDisplay.append(chatLines)))), contPanel)))))));
        
    ddShowButton[0].addEventListener('click', function() {ddShowsMenuClick(this);});
    ddEpButton[0].addEventListener('click', function() {ddEpMenuClick(this);});
    ddAltButton[0].addEventListener('click', function() {ddAltMenuClick(this);});
    panelButton[0].addEventListener('click', function() {generalButtonClick(this);});
    playButton[0].addEventListener('click', function() {generalButtonClick(this);});
    darkButton[0].addEventListener('click', function() {generalButtonClick(this);});
    seekBarDiv[0].addEventListener('click', function(e) {seekBarClick(e, this);});
    
    delayInput.on('keyup', function (e) {
        if (e.keyCode === 13)
            updateDelay();
    });
    
    if (settingsArray.timestamps === false) 
        containerTab.append($('<style>').html('.timestamp{display: none}'));
    
    staydownChat = new StayDown({
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
    for (var i = 0; i < showJSON.length; i++) {
        var ddShowMenuItemTemp = document.createElement('div');
        ddShowMenuItemTemp.id = 'ddMenuShowsItem'+i.toString();
        ddShowMenuItemTemp.innerHTML = showJSON[i][0];
        $('#TCR-ddShowMenuDiv')[0].appendChild(ddShowMenuItemTemp);
        ddShowMenuItemTemp.addEventListener('click', function() {ddShowsMenuClick(this);});
    }
}

function populateEpisodes() {
    for (var i = 0; i < showJSON[currentShow][1]; i++) {
        var ddEpMenuItemTemp = document.createElement('div');
        ddEpMenuItemTemp.id = 'ddEpMenuItem'+i.toString();
        ddEpMenuItemTemp.innerHTML = 'Ep '+(i+1).toString();
        $('#TCR-ddEpMenuDiv')[0].appendChild(ddEpMenuItemTemp);
        ddEpMenuItemTemp.addEventListener('click', function() {ddEpMenuClick(this);});
    }
}

function populateAlts() {
    if (showJSON[currentShow][2].length > 1) {
        for (var i = 0; i < showJSON[currentShow][2].length; i++) {
            var ddAltMenuItemTemp = document.createElement('div');
            ddAltMenuItemTemp.classList.add('TCR-ddAltMenuItem');
            ddAltMenuItemTemp.id = 'ddAltMenuItem'+i.toString();
            ddAltMenuItemTemp.innerHTML = showJSON[currentShow][2][i][1];
            $('#TCR-ddAltMenuDiv')[0].appendChild(ddAltMenuItemTemp);
            ddAltMenuItemTemp.addEventListener('click', function() {ddAltMenuClick(this);});
        }
        $('#TCR-ddAltMenuDiv')[0].childNodes[0].classList.add('selected');
    } else {
        $('#TCR-ddAltButton')[0].innerHTML = 'No Alts';
    }
}

function loadShows(jsonURL) {
    loadJSON(function(response) {showJSON = JSON.parse(response);}, jsonURL); //index:0-name, 1-numofep, 2-short
    populateShows();
}

function loadEpisodeJSONs() {
    for (var i = 0; i < showJSON[currentShow][2].length; i++) { //for each alt
        loadJSON(function(response) {epJSON[i] = JSON.parse(response);}, eID + showJSON[currentShow][2][i][0] + currentEp.toString() + '.json');
    }
}

function ddShowsMenuClick(element) { //Handle clicks on the shows dropdown menu, if its the main button show the menu, if its a menu item select the item
    switch (element.id) {
        case 'TCR-ddShowButton': {
            if ($('#TCR-ddShowButton')[0].classList.contains('inactive') === false) {
                $('#TCR-ddShowMenuDiv')[0].classList.toggle("show");
                raisePanel();
                resetPlayback(true);
            }
            break;
        }
        default: {
            var tempShow;
            found = showJSON.some(function(item, i) {tempShow = i; return item[0] === element.innerText}); //currentShow = showJSON.indexOf(function(item, i) {return item[0] === element.innerText});
            
            setCurrentShow(tempShow);
            setCurrentEp(1); //default to 1st episode
            resetPlayback(false);
            break;
        }
    }
}

function setCurrentShow(argShow) {    
    currentShow = argShow;

    $('#TCR-ddShowButton')[0].innerHTML = $('#TCR-ddShowMenuDiv')[0].childNodes[currentShow].innerHTML; 

    $('#TCR-ddEpButton')[0].classList.remove('inactive');
    $('#TCR-playButton')[0].classList.remove('inactive');
    
    $('#TCR-seekBarDivWrap')[0].classList.remove('inactive');
    
    $('#TCR-ddAltDiv')[0].classList.add('inactive');
    if (showJSON[currentShow][2].length > 1)
        $('#TCR-ddAltDiv')[0].classList.remove('inactive');
    
    $('#TCR-delayInput')[0].classList.remove('inactive');
    $('#TCR-delayInput')[0].removeAttribute('disabled');
    
    $('#TCR-delayLabel')[0].classList.remove('inactive');
    
    var ddEpMenuDiv = $('#TCR-ddEpMenuDiv');
    while (ddEpMenuDiv[0].hasChildNodes()) {ddEpMenuDiv[0].removeChild(ddEpMenuDiv[0].lastChild);}
    populateEpisodes();
    
    selectedAlts = [0];
    
    var ddAltMenuDiv = $('#TCR-ddAltMenuDiv');
    while (ddAltMenuDiv[0].hasChildNodes()) {ddAltMenuDiv[0].removeChild(ddAltMenuDiv[0].lastChild);}
    populateAlts();
}

function setCurrentEp(argEp) {
    currentEp = argEp;
    
    $('#TCR-ddEpButton')[0].innerHTML = 'Ep ' + currentEp; 
    
    divBarPres();
    loadEpisodeJSONs();
}

function ddEpMenuClick(element) { //Handle clicks on the episodes dropdown menu, if its the main button show the menu, if its a menu item select the item
    switch (element.id) {
        case 'TCR-ddEpButton': {
            if ($('#TCR-ddEpButton')[0].classList.contains('inactive') === false) {
                $('#TCR-ddEpMenuDiv')[0].classList.toggle("show"); 
                raisePanel();
                resetPlayback(true);
            }
            break;
        }
        default: {
            setCurrentEp(Number(element.innerHTML.substring(3)));
            resetPlayback(false);
            break;
        }
    }
}

function ddAltMenuClick(element) { //Handle clicks on the alt broadcasts dropdown menu
    switch (element.id) {
        case 'TCR-ddAltButton': {
            if ($('#TCR-ddAltDiv')[0].classList.contains('inactive') === false) {
                $('#TCR-ddAltMenuDiv')[0].classList.toggle("show"); 
                raisePanel();
            }
            break;
        }
        default: {
            var val = Number(element.id.substring(13)); //only 1 digit.. fix with regex?
            
            if (selectedAlts.some(function(item, i) {ind = i; return item === val}))
                selectedAlts.splice(ind, 1);
            else
                selectedAlts.push(val);
            
            $('#TCR-ddAltMenuDiv')[0].childNodes[val].classList.toggle('selected');
            break;
        }
    }
}

function seekBarClick(e, element) {
    if (!$('#TCR-seekBarDivWrap')[0].classList.contains('inactive')) {
        var secs = Math.floor((e.offsetX / $('#TCR-seekBarDiv')[0].clientWidth) * Math.floor(getCurrentEpLength()));
        
        if (settingsArray.vlcEnabled) {
            VLCCommand('seek&val=' + secs, function() {});
            VLCInfo.time = secs;
        }
        
        loadEpisodeJSONs();
        
        playedTime = secs * 1000;
        updateTimeDisplay();
    }
}

function togglePanel() {
    $('#TCR-panelButton')[0].classList.toggle('panelButtonToggle');
    $('#TCR-panel')[0].classList.toggle('panelToggle');
    $('#TCR-scrollChat')[0].classList.toggle('panelToggle');
}

function raisePanel() {
    $('#TCR-panelButton')[0].classList.remove('panelButtonToggle');
    $('#TCR-panel')[0].classList.remove('panelToggle');
    $('#TCR-scrollChat')[0].classList.remove('panelToggle');
}

function lowerPanel() {
    $('#TCR-panelButton')[0].classList.add('panelButtonToggle');
    $('#TCR-panel')[0].classList.add('panelToggle');
    $('#TCR-scrollChat')[0].classList.add('panelToggle');
}

function resetPlayback(removeChat) {
    playing = false;
    if (removeChat) {
        var numberOfChatMessagesDisplayed = $('#TCR-chatLines').find('.chat-line').length;
        $('#TCR-chatLines').find('.chat-line:lt(' + numberOfChatMessagesDisplayed + ')').remove();
    }
    $('#TCR-playButton')[0].classList.remove('pause', 'next');
    playedTime = 0;
    updateTimeDisplay();
}

function updateDelay() {
    var delayInputValue = Number($('#TCR-delayInput')[0].value);
    if (isNaN(delayInputValue) === false) {
        delayTime = delayInputValue * 1000;
        $('#TCR-delayInput')[0].value = 'delay';
    }
    $('#TCR-delayLabel')[0].innerText = (delayTime / 1000) + ' sec';
}

function playPause(updateVLC) {
    if ($('#TCR-playButton')[0].classList.contains('inactive') === false) { //if we are setup to play
        if ($('#TCR-playButton')[0].classList.contains('next') === true) { 
            setCurrentEp(currentEp + 1);
            resetPlayback(false);
            playPause(false);
        } else { //if we are pressing play/pause
            playing = !playing;
            $('#TCR-playButton')[0].classList.toggle('pause');
            
            if (playing === true) {
                lowerPanel();
                lastPlayUpdate = Date.now();
                staydownChat.interval = 50;
                
                if (settingsArray.vlcEnabled && updateVLC) {                //if we are sending to vlc
                    if (Math.abs(VLCInfo.time - playedTime / 1000) > 2) {   //first check if vlc is far away from our time
                        VLCCommand('seek&val=' + Math.floor(playedTime / 1000), function() {    //and seek if so
                            VLCCommand('pl_forceresume', function() {       //once seeking is over then resume
                                startPlaying();                             //and once vlc is playing start the chat
                                VLCInfo.state = 'playing';
                            });
                            VLCInfo.time = playedTime / 1000;
                        });
                    } else {                                                //else if we dont need to seek just play
                        VLCCommand('pl_forceresume', function() {
                            startPlaying();
                            VLCInfo.state = 'playing';
                        });
                    }
                } else {
                    startPlaying();
                }
            } else {
                staydownChat.interval = 1000000;
                
                if (settingsArray.vlcEnabled && updateVLC) {
                    VLCCommand('pl_forcepause', function() {
                        if (Math.abs(VLCInfo.time - playedTime / 1000) > 1) {
                            VLCCommand('seek&val=' + Math.floor(playedTime / 1000), function() {
                                VLCInfo.time = playedTime / 1000;
                            });
                        }
                        VLCInfo.state = 'paused';
                    });
                }
            }
        }
    }
}

function generalButtonClick(element) {
        switch (element.id) {
        case 'TCR-playButton': {
            playPause(true);
            break;
        }
        case 'TCR-panelButton': {
            togglePanel();
            break;
        }
        case 'TCR-darkButton': {
            $('.ember-chat-container')[0].classList.toggle('darkmode');
            $('.button').each(function () {this.classList.toggle('darkmode')});
            $('#TCR-panel')[0].classList.toggle('darkmode');
            $('#TCR-delayInput')[0].classList.toggle('darkmode');
            $('#TCR-seekBarDiv')[0].classList.toggle('darkmode');
            $('.TCR-seekBarDivBarPre').each(function () {this.classList.toggle('darkmode');});
            $('#TCR-seekBarDivBar')[0].classList.toggle('darkmode');
            $('#TCR-seekBarDivTime')[0].classList.toggle('darkmode');
            $('#TCR-ddShowMenuDiv')[0].classList.toggle('darkmode');
            $('#TCR-ddEpMenuDiv')[0].classList.toggle('darkmode');
            $('#TCR-ddAltMenuDiv')[0].classList.toggle('darkmode');
            
            break;
        }
    }
}

function formatmmss(timeSec) {
    var secs = (timeSec % 60).toString();
    return Math.floor(timeSec / 60).toString() + ':' + '0'.repeat(2 - secs.length) + secs;
}

function updateTimeDisplay() {
    if (currentShow != null) {
        $('#TCR-seekBarDivBar')[0].style.width = 100 * (Math.floor((playedTime)/1000)) / (getCurrentEpLength()) + '%';
        $('#TCR-seekBarDivTime')[0].innerHTML = formatmmss(Math.floor((playedTime)/1000)) + ' / ' + formatmmss(Math.floor(getCurrentEpLength()));
    }
}

function startPlaying() {
    if (playing === true) {
        playedTime += Date.now() - lastPlayUpdate;
        lastPlayUpdate = Date.now();
        
        updateTimeDisplay();
        
        while (true) {
            if (selectedAlts.every(function f(alt) { //for every selected alt index
            
                if (epJSON[alt].index.length > 0) {
                    //"the time we have currently played" - "when this message occurs in the total session" - "the extra time to delay" - "time to offset the message"
                    
                    var offsetTime = 0; //Built into the files with new system now, will remove later
                    /*if (showJSON[currentShow][3][currentEp - 1][0][1] == 1) { //Hacky solution that doesn't support mid episode breaks (which there aren't any yet, but its not a general solution)
                        console.log('yes');
                        offsetTime = showJSON[currentShow][3][currentEp - 1][0][0] * 1000; //episode intro
                        
                    }*/
                    
                    var msgRelativeTime = playedTime - epJSON[alt].index[0]*1000 - delayTime - offsetTime;
                    
                    if (msgRelativeTime < 0) {
                        return true; //this message is in the future so do nothing
                    } else {
                        if (msgRelativeTime < 3000) { //post the message if its less than 3 seconds in the past
                            $('#TCR-chatLines').append(formatChatMessageTCR(epJSON[alt].data[0], epJSON[alt].index[0]*1000 + offsetTime));
                        }
                        epJSON[alt].index.shift(); //remove the message regardless
                        epJSON[alt].data.shift();
                    }
                } else
                    return true;
            
            })) {
                break;
            }
        }
        
        var preEndSkip = 0;
        if (showJSON[currentShow][3][currentEp - 1][showJSON[currentShow][3][currentEp - 1].length - 1][1] == 1) //If the last section is a skip then don't count it in the time
            preEndSkip = showJSON[currentShow][3][currentEp - 1][showJSON[currentShow][3][currentEp - 1].length - 1][0];
            
        if (playedTime - delayTime - (getCurrentEpLength() - preEndSkip) * 1000 > 200) { //if we are 0.2 sec past the ep cutoff point, then load next ep stuff
            
            playPause(false);
            
            if (settingsArray.vlcEnabled) {
                setCurrentEp(currentEp + 1);
                playedTime = 0;
                
                VLCInfo.state = 'playing';
                VLCInfo.time = 0;
                
                var ind;
                if (found = VLCInfo.playlist.some(function(item, i) {ind = i; return item.name === VLCInfo.file})){
                    VLCInfo.file = VLCInfo.playlist[ind + 1].name;
                } else {
                    console.log("Error: couldn't find file in playlist, make the playlist simpler and be sure file names have no strange characters");
                }
                
                VLCCommand('seek&val=0', function () {                        
                    VLCCommand('pl_next', function () {
                        VLCCommand('pl_forcepause', function () {
                            setTimeout(function () {
                                VLCSetupShow();
                                playPause(true);
                            }, 500);
                        });
                    });
                });
                
            } else {
                if (currentEp < showJSON[currentShow][1])
                    $('#TCR-playButton')[0].classList.toggle('next');
            }
        } else {
            setTimeout(startPlaying, 200);
        }
        
        if (!userScrolling) {
            var numberOfChatMessagesDisplayed = $('#TCR-chatLines').find('.chat-line').length;
            if (numberOfChatMessagesDisplayed >= settingsArray.chatDisplayLimit) {
                $('#TCR-chatLines').find('.chat-line:lt(' + Math.max(numberOfChatMessagesDisplayed - settingsArray.chatDisplayLimit, 10) + ')').remove();
            }
        }
    }
}

 var hexToRgb = function(hex) {
      var bigint = parseInt(hex, 16);
      var r = (bigint >> 16) & 255;
      var g = (bigint >> 8) & 255;
      var b = bigint & 255;
  
      return [r, g, b];
}

function formatChatMessageTCR(messageData, time) {

    var name = messageData[0];
    var color = messageData[1];
    var msg = messageData[2];
    
    var argBadges = messageData[6];
    
    var line = $('<li>').addClass('message-line chat-line ember-view');
    var div = $('<div>');

    var timespan = $('<span>').addClass('timestamp float-left').text(formatmmss(Math.floor(time/1000)));
    var badges = $('<span>').addClass('float-left badges');
    var from = $('<span>').addClass('from').css({'color': color}).text(name);
    var colon = $('<span>').addClass('colon').text(':');
    var message = $('<span>').addClass('message');

    if (msg.substring(0, 4) === "/me ") { //this edits the message
        line.addClass('action');
        msg = msg.substring(4);
        message.css({ 'color': color });
    }
    
    var messageHTML = textFormatter(msg, messageData[3], messageData[4], messageData[5]);
    message.html(messageHTML);
    
    if (name in settingsArray.nameHighlightHashTable) {
        line.addClass('TCR-Highlight');
        var rgb = hexToRgb(color.substring(1));
        line.css({'background-color': 'rgba(' + rgb[0] + ', ' + rgb[1] + ', ' + rgb[2] + ', 0.15)', 'box-shadow': '4px 0px 0px ' + color + ' inset'});
    } else if (name === 'ohbot') {
        argBadges = [[3, 2, 1],0]
    } else if (name === 'twitchnotify') {
        line.addClass('admin');
        timespan = badges = from = colon = null;
    } else if (name === '_TCRMSG') {
        if (msg === 'SNACK TIME') {
            line.addClass('tcrmsg snacks');
        } else {
            line.addClass('tcrmsg fin');
        }
        
        div.addClass('tcrmsgdiv');
        message.addClass('tcrmsg');
        
        timespan = badges = from = colon = null;
    }
    
    if (settingsArray.badges === true) {
        applyMessageBadges(argBadges, badges);
    }
    
    line.append(div.append(timespan, ' ', badges, ' ', from, colon, ' ', message));
    
    return line;
}

function textFormatter(text, ttvG, btvG, ttvC) {
    var messageParts = replaceTwitchEmoticonsByRanges(text, ttvG, btvG, ttvC);
    
    // further split parts by spaces
    var parts = [];
    messageParts.forEach(function(part) {
        if (Array.isArray(part)) 
            return parts.push(part);

        parts = parts.concat(part.split(' '));
    });
    
    messageParts = parts;

    // handles third party emotes, escaping, and linkification
    for(var i = 0; i < messageParts.length; i++) {
        var part = messageParts[i];

        if (settingsArray.bttvEmotes === true) 
            part = replaceBTTVEmoticons(part);
        
        if (settingsArray.emojis === true) 
            part = replaceEmoji(part);
        
        part = replaceMentions(part);        
        part = escapeAndLink(part);

        messageParts[i] = Array.isArray(part) ? part[0] : part;
    }

    return messageParts.join(' ');
};

function replaceMentions(part) {
    if (typeof part !== 'string') return part;
    
    if (part[0] === '@')
        return [$('<span>').addClass('mentioning').text(part)[0].outerHTML];
    
    return part;
};

function replaceEmoji(part) {
    if (typeof part !== 'string') return part;
    
    var origPart = twemoji.parse(part, {'callback': 
        function(iconID, options) {
            part = part.replace(twemoji.convert.fromCodePoint(iconID), $('<img>').attr({src: ''.concat(options.base, options.size, '/', iconID, options.ext)}).addClass('emoticon bttv-emoji')[0].outerHTML);
        }
    });
    
    if (part != origPart)
        return [part];
    
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
    if (settingsArray.bttvEmotesDict.hasOwnProperty(part)) {
        emote = settingsArray.bttvEmotesDict[part];
    } else if (settingsArray.bttvEmotesDict.hasOwnProperty(codeWithoutSymbols)) {
        emote = settingsArray.bttvEmotesDict[codeWithoutSymbols];
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
    if (settingsArray.emoteFilter.length === 0) {
        emotesToReplace.push(emote);
    } else if (settingsArray.emoteFilter.includes(part) === false) {
        emotesToReplace.push(emote);
    }
}

function replaceTwitchEmoticonsByRanges(text, ttvG, btvG, ttvC) {
    var emotesToReplace = [];

    ttvG.forEach(function(emote) {
        var emoteRangeBegin = emote[1][0]
        var emoteRangeEnd = emote[1][1]
        pushAfterFilter(emotesToReplace, substringUnicode(text, emoteRangeBegin, emoteRangeEnd + 1), {id: emote[0], begin: emoteRangeBegin, end: emoteRangeEnd, type: 'ttvG'});
    });
    
    if (settingsArray.bttvEmotes === true) {
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
        if (second >= 0xDC00 && second <= 0xDFFF)
            return string.substring(index, index + 2);
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
        if (unicodeIndex >= start && unicodeIndex < end)
            accumulator += character;
        stringIndex += character.length;
        unicodeIndex += 1;
    }
    return accumulator;
}

function toNumber_lautis(value, fallback) {
    if (value === undefined)
        return fallback;
    else
        return Number(value);
}

function substringUnicode(string, start, end) {
    var realStart = toNumber_lautis(start, 0);
    var realEnd = toNumber_lautis(end, string.length);
    if (realEnd == realStart)
        return "";
    else if (realEnd > realStart)
        return slice_lautis(string, realStart, realEnd);
    else
        return slice_lautis(string, realEnd, realStart);
}

function buildBadge() {
    return $('<div>').addClass('float-left').addClass('badge');
};

function applyMessageBadges(badgeData, badges) {
    
    if (badges === null || badgeData[0].length === 0) return badges;
    
    badgeData[0].forEach(function(item) { //badgeIds = {'turbo' : 0, 'premium' : 1, 'subscriber' : 2, 'moderator' : 3, 'bits' : 4, 'staff' : 5, 'global_mod' : 6, 'partner' : 7, 'admin' : 8, 'broadcaster' : 9}
        
        if (item === 4) {
            var badgeContent = buildBadge().addClass('turbo').prop('title', badgeArray[item][1] + badgeData[1]).css('background-image', 'url(https://static-cdn.jtvnw.net/badges/v1/' + badgeArray[item][0][badgeData[1]] + '/1)');
        } else {
            var badgeContent = buildBadge().addClass('turbo').prop('title', badgeArray[item][1]).css('background-image', 'url(https://static-cdn.jtvnw.net/badges/v1/' + badgeArray[item][0] + '/1)');
        }

        badges.append(badgeContent).append(' ');
    });
}

function loadBTTVEmotes(channels, bttvEmotesDict) {
    var endpointsList = [];
    channels.forEach(function(channel) {endpointsList.push('channels/' + encodeURIComponent(channel))});
    endpointsList.forEach(function(endpoint) {
        $.getJSON('https://api.betterttv.net/2/' + endpoint).done(function(data) {
            data.emotes.forEach(function(emote) {
                bttvEmotesDict[emote.code] = {
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
    if (!event.target.matches('.TCR-ddShowButton')) {
        $('#TCR-ddShowMenuDiv')[0].classList.remove('show');
    }
    if (!event.target.matches('.TCR-ddEpButton')) {
        $('#TCR-ddEpMenuDiv')[0].classList.remove('show');
    }
    if (!event.target.matches('#TCR-ddAltButton') && !event.target.matches('.TCR-ddAltMenuItem')) {
        $('#TCR-ddAltMenuDiv')[0].classList.remove('show');
    }
}

function loadJSON(callback, path) {   
    var xobj = new XMLHttpRequest();
	xobj.overrideMimeType("application/json");
    xobj.open('GET', path, false);
    xobj.onreadystatechange = function () {
        if (xobj.readyState == 4 && xobj.status == "200") {
            callback(xobj.responseText);
        }
    };
    xobj.send(null);  
}