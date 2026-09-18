fx_version 'cerulean'
game 'gta5'
lua54 'yes'

name 'ls_shops'
description 'Clothing stores, barbershops, Ammu-Nation and 24/7 - with blips and a style editor'
version '1.0.0'

dependency 'phone_garage'   -- the wallet lives there

ui_page 'html/index.html'

shared_script 'config.lua'
client_script 'client/main.lua'
server_script 'server/main.lua'

files {
    'html/index.html',
    'html/style.css',
    'html/app.js'
}
