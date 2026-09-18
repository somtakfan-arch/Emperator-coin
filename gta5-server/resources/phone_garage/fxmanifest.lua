fx_version 'cerulean'
game 'gta5'
lua54 'yes'

name 'phone_garage'
description 'Phone garage: buy cars in a dealership app, call them to the nearest parking spot, put them back'
version '1.0.0'

ui_page 'html/index.html'

shared_script 'config.lua'
client_script 'client/main.lua'
server_script 'server/main.lua'

files {
    'html/index.html',
    'html/style.css',
    'html/app.js'
}
