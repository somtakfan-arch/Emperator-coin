fx_version 'cerulean'
game 'gta5'
lua54 'yes'

name 'ls_inventory'
description 'Grid inventory: 54 slots, +18 with a backpack. Everything bought lands here first.'
version '1.0.0'

dependency 'phone_garage'   -- the wallet lives there

ui_page 'html/index.html'

shared_script 'config.lua'
client_script 'client/main.lua'
server_script 'server/main.lua'

files {
    'html/index.html',
    'html/style.css',
    'html/app.js',
    'html/icons.js'
}
