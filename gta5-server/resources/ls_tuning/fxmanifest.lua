fx_version 'cerulean'
game 'gta5'
lua54 'yes'

name 'ls_tuning'
description 'Los Santos Customs: full vehicle tuning, everything available from the start'
version '1.0.0'

dependency 'phone_garage'

ui_page 'html/index.html'

shared_scripts {
    'config.lua',
    'locale.lua',
}

client_script 'client/main.lua'
server_script 'server/main.lua'

files {
    'html/index.html',
    'html/style.css',
    'html/app.js'
}
