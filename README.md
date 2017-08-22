# TwitchChatReplay

An extension to replay twitch chat logs in a local popup window.

Currently only supports Chrome.


## Build

Twitch Chat Replay is built using Node.js.

1. Run ```npm install``` in the parent directoy
2. Run <pre>npm run-script build test webkit</pre>

## Install

The extension is built to the 'build' directory.  You can open the extension in Chrome by going to the extensions page and selectiong 'Load unpacked extension...'

## Bugs
 
If you have a problem please [open an issue] (https://github.com/ahabyss/TwitchChatReplay/issues/new).



## JSON Parsing

The chat logs are from overrustle, and are converted into a readable format using a python analysis script, which can be found at [Twitch Chat Replay Parser] https://github.com/ahabyss/TCRParser. Using this you can easily parse any chat log so that it can be read with this extension.
