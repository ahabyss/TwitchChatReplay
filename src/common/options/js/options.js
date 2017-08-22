var $ = require('jquery');
require('./tooltips')($);
require('./editableTable')($);

var pageEvents = require('./pageEvents');
var generalPanel = require('./generalPanel');
var settingsInterface = require('./settingsInterface');

function init() {
    generalPanel.init();

    $('.tooltipTrigger').Tooltip();

    settingsInterface.loadStoredSettingsToPage().then(function() {
        pageEvents.init();
        pageEvents.setOptionsPanel('general');
    });
}

document.addEventListener('DOMContentLoaded', init, false);