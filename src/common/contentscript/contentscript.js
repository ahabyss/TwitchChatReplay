var browserBackend = require('browserBackend');
var extensionSettings = require('extensionSettings');
var StayDown = require('staydown');

var jsonID = null;
var showJSON = null;
var epJSON = null;
var currentShow;
var currentEp;
var playing = false;

var containerTab;
var scrollChat;
var contPanel;
var chatLines;
var timeDiv;
var panelButton;
var playButton;
var ddEpDiv;
var ddEpButton;
var ddEpMenuDiv;
var timeInput;
var ddButton;
var ddMenuDiv;

var settingsBTTVEmotes = null;
var settingsBTTVChannels = null;

var pauseTime = 0;
var timeStart = null;

var suburl = '40fbcba3-7765-4f14-a625-8577d92e830d';
var primeurl = 'a1dd5073-19c3-4911-8cb4-c464a7bc1510';

var firstMsgTime = null;
var currentMsgTime = null;
var currentMsgData = null;

var chatDisplayLimit = 50;

var bttvEmotes = {};
var autolinker = null;

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
        settingsEmoteFilterTable = settings.emoteFilterList;
        settingsEmoteFilterList = [];
        
        settingsEmoteFilterTable.forEach(function(item) {
            if (item.type === 'Emote')
                settingsEmoteFilterList.push(item.value);
        });
        
        jsonID = jsonURL.substring(0, jsonURL.length-10);
        
        chatLoaded();
        loadShows(jsonURL);
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

function chatLoaded() {

    containerTab = $('.ember-application').first();
    
    deleteTwitchStuff();
    setTimeout(deleteTwitchStuff, 1000);
    
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

    ddEpDiv = $('<div>').addClass('TCR-dropdownEp inactive');
    ddEpButton = $('<button>').addClass('TCR-ddEpButton button').text('Ep X').attr('id', 'TCR-ddEpButton');
    ddEpMenuDiv = $('<div>').addClass('TCR-ddEpMenu').attr('id', 'TCR-ddEpMenu');
    
    panelButton = $('<button>').addClass('button TCR-panelButton').attr('id', 'TCR-panelButton');
    playButton = $('<button>').addClass('button TCR-playButton inactive').attr('id', 'TCR-playButton');
    timeDiv = $('<div>').addClass('TCR-timeDiv inactive').text('-').attr('id', 'TCR-timeDiv');
    timeInput = $('<input>').addClass('TCR-timeInput inactive').attr('id', 'TCR-timeInput').attr('disabled', '').attr('value', '');
   
    contPanel.append(panelButton);
    contPanel.append(ddDiv);
    ddDiv.append(ddButton);
    ddDiv.append(ddMenuDiv);
    contPanel.append(ddEpDiv);
    ddEpDiv.append(ddEpButton);    
    ddEpDiv.append(ddEpMenuDiv);
    contPanel.append(playButton);
    contPanel.append(timeDiv);
    contPanel.append(timeInput);
    
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
    
    panelButton[0].addEventListener('click', function() {generalButtonClick(this);});
    playButton[0].addEventListener('click', function() {generalButtonClick(this);});
    
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

function deleteTwitchStuff() {
    containerTab.children('div').each(function(a, b) {if (b.classList.contains('TCR-ember-view') === false) b.remove();});
    containerTab.children('noscript').each(function(a, b) {b.remove();});
    containerTab.children('img').each(function(a, b) {b.remove();});
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

function loadShows(jsonURL) {
    loadJSON(function(response) {showJSON = JSON.parse(response);}, jsonURL); //index:0-name, 1-numofep, 2-short
    populateShows();
}

function loadEpisodes() {
    loadJSON(function(response) {epJSON = JSON.parse(response);}, jsonID + showJSON[currentShow][2] + currentEp.toString() + '.json');
    
    currentMsgTime = epJSON.index.shift();
    currentMsgData = epJSON.data.shift();
    firstMsgTime = currentMsgTime;
}

function ddShowsMenuClick(element) { //Handle clicks on the shows dropdown menu, if its the main button show the menu, if its a menu item select the item
    switch (element.id) {
        case 'TCR-ddButtonShows': {
            ddMenuDiv[0].classList.toggle("show");
            raisePanel();
            resetPlayback();
            break;
        }
        default: {
            ddButton[0].innerHTML = element.innerHTML; 
            currentShow = showJSON.findIndex(function(item, i) {return item[0] === element.innerHTML});
            
            ddEpDiv[0].classList.remove('inactive');
            playButton[0].classList.remove('inactive');
            timeInput[0].classList.remove('inactive');
            timeInput[0].removeAttribute('disabled');
            
            while (ddEpMenuDiv[0].hasChildNodes()) {ddEpMenuDiv[0].removeChild(ddEpMenuDiv[0].lastChild);}
            
            ddEpButton[0].innerHTML = 'Ep 1'; 
            currentEp = 1;
            
            populateEpisodes(ddEpMenuDiv[0]);
            loadEpisodes();
            
            break;
        }
    }
}

function ddEpMenuClick(element) { //Handle clicks on the episodes dropdown menu, if its the main button show the menu, if its a menu item select the item
    switch (element.id) {
        case 'TCR-ddEpButton': {
            if (ddEpDiv[0].classList.contains('inactive') === false) {
                ddEpMenuDiv[0].classList.toggle("show"); 
                resetPlayback();
                raisePanel();
            }
            break;
        }
        default: {
            ddEpButton[0].innerHTML = element.innerHTML; 
            currentEp = Number(element.innerHTML.substring(3));
            loadEpisodes();
            break;
        }
    }
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

function resetPlayback() {
    playing = false;
    chatLines.find('.chat-line:lt(' + chatLines.find('.chat-line').length + ')').remove();
    playButton[0].classList.remove('pause');
    timeStart = Date.now();
    timeDiv[0].innerHTML = '-';
    pauseTime = 0;
}

function generalButtonClick(element) {
        switch (element.id) {
        case 'TCR-playButton': {
            if (element.classList.contains('inactive') === false) {
                timeDiv[0].classList.remove('inactive');
                element.classList.toggle('pause');
                playing = !playing;
                
                if (playing === true) {
                
                    timeInputValueArray = timeInput[0].value.split(':');
                    if (timeInputValueArray.length > 1) {
                        loadEpisodes();
                        if (timeInputValueArray.length == 2) {
                            pauseTime = (Number(timeInputValueArray[0]) * 60 + Number(timeInputValueArray[1])) * 1000;
                        } else {
                            pauseTime = (Number(timeInputValueArray[0]) * 3600 + Number(timeInputValueArray[1]) * 60 + Number(timeInputValueArray[2])) * 1000;
                        }
                    }
                    timeInput[0].value = '';
                
                    timeStart = Date.now();
                    startPlaying();
                    staydown.interval = 50;

                    } else {
                    pauseTime += Date.now() - timeStart;
                    staydown.interval = 1000000;              
                }                
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
    timeDiv[0].innerHTML = formatmmss(Math.floor((pauseTime + Date.now() - timeStart)/1000));
}

function startPlaying() {
    if (playing === true) {
        updateTimeDisplay()
        
        while (true) {
            if ((pauseTime + Date.now() - timeStart) - (currentMsgTime - firstMsgTime) >= 2000) { //if this message is more than 2 seconds before NOW, don't even show the msg
                currentMsgTime = epJSON.index.shift();
                currentMsgData = epJSON.data.shift();
            } else if ((pauseTime + Date.now() - timeStart) - (currentMsgTime - firstMsgTime) >= 0) { //if this message occurs before NOW then show the msg
                chatLines.append(formatChatMessageTCR(currentMsgData, currentMsgTime));
                currentMsgTime = epJSON.index.shift();
                currentMsgData = epJSON.data.shift();
            } else
                break;
        }
        
        if (!userScrolling) {
            var numberOfChatMessagesDisplayed = chatLines.find('.chat-line').length;
            if (numberOfChatMessagesDisplayed >= chatDisplayLimit) {
                chatLines.find('.chat-line:lt(' + Math.max(numberOfChatMessagesDisplayed - chatDisplayLimit, 10) + ')').remove();
            }
        }
            
        setTimeout(startPlaying, 200);
    }
}

function formatChatMessageTCR(messageData, time) {

    name = messageData[0];
    color = messageData[1];
    msg = messageData[2];
    
    var line = $('<li>').addClass('message-line chat-line ember-view');
    var div = $('<div>');
    
    if (name === 'twitchnotify')
        line.addClass('admin');
    
    var timespan = $('<span>').addClass('timestamp float-left').text(formatmmss(Math.floor((time - firstMsgTime)/1000)));

    var badges = $('<span>').addClass('float-left badges');
    if (settingsBadges === true) applyMessageBadges(messageData[6], badges);

    var from = $('<span>').addClass('from').css({'color': color}).text(name);
    var colon = $('<span>').addClass('colon').text(':');

    if (msg.substring(0, 3) === "/me ") {
        message.css({ 'color': color });
        msg = msg.substring(4);
        line.addClass('action');
    }    
    var messageHTML = textFormatter(msg, messageData[3], messageData[4], messageData[5]);
    var message = $('<span>').addClass('message').html(messageHTML);

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

        if (settingsBTTVEmotes === true) {part = replaceBTTVEmoticons(part);}
        if (settingsEmojis === true) {part = replaceEmoji(part);}
        
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
        
    if (part[0] === '@')
        return [$('<span>').addClass('mentioning').text(part)[0].outerHTML];
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
            src: emote['1x'],
            srcset: emote['2x'] + ' 2x',
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
        pushAfterFilter(emotesToReplace, text.substring(emoteRangeBegin, emoteRangeEnd+1), {id: emote[0], begin: emoteRangeBegin, end: emoteRangeEnd, type: 'ttvG'});
    });
    
    if (settingsBTTVEmotes === true) {
        btvG.forEach(function(emote) {
            var emoteRangeBegin = emote[1][0]
            var emoteRangeEnd = emote[1][1]
            pushAfterFilter(emotesToReplace, text.substring(emoteRangeBegin, emoteRangeEnd+1), {id: emote[0], begin: emoteRangeBegin, end: emoteRangeEnd, type: 'btvG'});
        });
    }
        
    ttvC.forEach(function(emote) {
        var emoteRangeBegin = emote[1][0]
        var emoteRangeEnd = emote[1][1]
        pushAfterFilter(emotesToReplace, text.substring(emoteRangeBegin, emoteRangeEnd+1), {id: emote[0], begin: emoteRangeBegin, end: emoteRangeEnd, type: 'ttvC'});
    });

    emotesToReplace.sort(function(x, y) {return y.begin - x.begin;});

    var messageParts = [];

    emotesToReplace.forEach(function(emote) {
        var emoteText = text.substring(emote.begin, emote.end + 1)

        // Unshift the end of the message (that doesn't contain the emote)
        messageParts.unshift(text.slice(emote.end + 1));

        if (emote.type === 'ttvG' || emote.type === 'ttvC') {
            // Unshift the emote HTML (but not as a string to allow us to process links, escape html, and other emotes)
            var imageBaseUrl = '//static-cdn.jtvnw.net/emoticons/v1/' + emote.id;
            messageParts.unshift([
                $('<img>').attr({
                    src: imageBaseUrl + '/1.0',
                    srcset: imageBaseUrl + '/2.0 2x',
                    alt: emoteText,
                    title: emoteText
                }).addClass('emoticon')[0].outerHTML
            ]);
        } else if (emote.type === 'btvG') {
            var imageBaseUrl = '//cdn.betterttv.net/emote/' + emote.id;
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
        text = text.slice(0, emote.begin);
    });

    // Unshift the remaining part of the message (that contains no Twitch emotes)
    messageParts.unshift(text);

    return messageParts;
};

function buildBadge() {
  return $('<div>').addClass('float-left').addClass('badge');
};

function applyMessageBadges(badgeData, badges) {
    if (badgeData[0]) {
        var badgeContent = buildBadge().addClass('turbo').prop('title', 'Twitch Turbo');
        badges.append(badgeContent).append(' ');
    } else if (badgeData[1]) {
        var badgeContent = buildBadge().addClass('prime').prop('title', 'Twitch Prime')
            .css('background-image', 'url(https://static-cdn.jtvnw.net/badges/v1/' + primeurl + '/1)');
        badges.append(badgeContent).append(' ');
    }
    if (badgeData[2]) {
        var badgeContent = buildBadge().addClass('subscriber').prop('title', 'Subscriber')
            .css('background-image', 'url(https://static-cdn.jtvnw.net/badges/v1/' + suburl + '/1)');
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
        var dropdowns = document.getElementsByClassName("TCR-ddMenu");
        var i;
        for (i = 0; i < dropdowns.length; i++) {
            var openDropdown = dropdowns[i];
            if (openDropdown.classList.contains('show')) {
                openDropdown.classList.remove('show');
            }
        }
    }
    if (!event.target.matches('.TCR-ddEpButton')) {
        var dropdowns = document.getElementsByClassName("TCR-ddEpMenu");
        var i;
        for (i = 0; i < dropdowns.length; i++) {
            var openDropdown = dropdowns[i];
            if (openDropdown.classList.contains('show')) {
                openDropdown.classList.remove('show');
            }
        }
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