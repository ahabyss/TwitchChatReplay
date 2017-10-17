var clone = require('clone');
var unique = require('uniq');
var browserStorage = require('./browserStorage');

var URL_EXTRACTION_REGEX = /^(?:\w+:\/\/)?(?:www\.)?([^\s\/]+(?:\/[^\s\/]+)*)\/*$/i;

var DEFAULT_SETTINGS = {
    bttvEmotes: true,
    timestamps: true,
    emojis: true,
    badges: true,
    vlcPass: 'TCR',
    vlcEnabled: true,
    bttvChannelsList: ['monkasen', 'thefreaking2'],
    emoteFilterList: [],
    nameHighlightList: ['ahabyss']
};

function getSettings() {
    return new Promise(function(resolve) {
        browserStorage.load().then(function(data) {
            resolve(sanitizeSettings(data));
        }).catch(function() {
            resolve(sanitizeSettings({}));
        });
    });
}

function setSettings(data) {
    return new Promise(function(resolve, reject) {
        browserStorage.save(sanitizeSettings(data)).then(function() {
            resolve();
        }).catch(function() {
            reject();
        });
    });
}

function sanitizeSettings(settings) {
    var finalSettings = clone(DEFAULT_SETTINGS);

    for (var key in finalSettings) {
        if (finalSettings.hasOwnProperty(key) && settings[key] !== undefined) {
            if (typeof finalSettings[key] === 'boolean') {
                finalSettings[key] = settings[key] === true;
            } else if (Array.isArray(finalSettings[key])) {
                finalSettings[key] = filterInvalidListEntries(settings[key]);
            } else {
                finalSettings[key] = settings[key];
            }
        }
    }

    return finalSettings;
}

function filterInvalidListEntries(list) {
    var result = list || [];

    for (var i = result.length - 1; i >= 0; --i) {
        var entry = result[i];

        if (!entry) {
            result.splice(i, 1);
        } else if (typeof entry === 'string' && !entry.trim()) {
            result.splice(i, 1);
        } else if (typeof entry === 'object') {
            if (Object.keys(entry).length === 0) {
                result.splice(i, 1);
            } else {
                for (var key in entry) {
                    if (entry.hasOwnProperty(key)) {
                        if (!entry[key]) {
                            result.splice(i, 1);
                            break;
                        }
                    }
                }
            }
        }
    }

    unique(list, function(first, second) {
        var equal = -1;

        if (typeof first === typeof second) {
            equal = 0;

            if (typeof first === 'object') {
                for (var key in first) {
                    if (first.hasOwnProperty(key) && first[key] !== second[key]) {
                        equal = -1;
                        break;
                    }
                }
            } else if (typeof first === 'string') {
                equal = first.toLowerCase() === second.toLowerCase() ? 0 : -1;
            } else {
                equal = first === second ? 0 : -1;
            }
        }

        return equal;
    });

    return result;
}

function bindEventToSettingsChange(callback) {
    browserStorage.bindOnStorageChange(function(changes) {
        callback(changes);
    });
}

function doesSettingExist(settingName) {
    return DEFAULT_SETTINGS.hasOwnProperty(settingName);
}


module.exports = {
    getSettings: getSettings,
    setSettings: setSettings,
    onSettingsChange: bindEventToSettingsChange,
    doesSettingExist: doesSettingExist,
    sanitizeSettings: sanitizeSettings
};