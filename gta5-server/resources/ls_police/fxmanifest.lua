fx_version 'cerulean'
game 'gta5'
lua54 'yes'

name 'ls_police'
description 'Police: duty and ranks, cuffs, escorting, search and seizure, wanted list, jail, fines, tools and an MDT'
version '1.0.0'

dependency 'ls_character'
dependency 'phone_garage'
dependency 'ls_inventory'
dependency 'ls_rp'

ui_page 'html/index.html'

shared_scripts {
    'config.lua',
    'locale.lua',
}

server_scripts {
    '@oxmysql/lib/MySQL.lua',
    'server/main.lua',
}

client_script 'client/main.lua'

files {
    'html/index.html',
    'html/style.css',
    'html/app.js'
}
