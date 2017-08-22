var $ = require('jquery');
require('./editableTable')($);

function init() {
    buildBTTVEmoteTable();
    buildEmoteFilterListTable();
}

function buildBTTVEmoteTable() {
    $('#bttvChannelsList').EditableTable({
        columns: [
            {
                name: 'name',
                displayName: 'Channels',
                type: 'text',
                placeholder: 'Channel name goes here.'
            }
        ]
    });
}

function buildEmoteFilterListTable() {
    $('#emoteFilterList').EditableTable({
        columns: [
            {
                name: 'set',
                displayName: 'Emote Set',
                type: 'select',
                options: ['Twitch.tv', 'BetterTTV']
            },
            {
                name: 'type',
                displayName: 'Rule Type',
                type: 'select',
                options: ['Channel', 'Emote'],
                onchange: function(row, value) {
                    if (value === 'Channel') {
                        row.find('td.value input').attr('placeholder', 'Channel Name');
                    } else {
                        row.find('td.value input').attr('placeholder', 'Emote Name');
                    }
                }
            },
            {
                name: 'value',
                displayName: '',
                type: 'text',
                placeholder: 'Channel Name'
            }
        ]
    });
}

module.exports = {
    init: init,
};