fx_version 'cerulean'
game 'gta5'
lua54 'yes'

name 'ls_crime'
description 'Robberies, drugs, chop shops, ATMs and turf, with police on the other end'
version '1.0.0'

ui_page 'html/index.html'

shared_script 'config.lua'
shared_script 'locale.lua'
client_script 'client/main.lua'
server_script 'server/main.lua'

files {
    'html/index.html',
    'html/style.css',
    'html/app.js'
}
