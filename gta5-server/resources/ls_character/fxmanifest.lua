fx_version 'cerulean'
game 'gta5'
lua54 'yes'

name 'ls_character'
description 'Character creation on first join: gender, face, name and a static ID'
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
