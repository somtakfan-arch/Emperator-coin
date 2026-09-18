fx_version 'cerulean'
game 'gta5'
lua54 'yes'

name 'ls_rp'
description 'Player interactions on E, and documents: passport, medical card, vehicle registration'
version '1.0.0'

dependency 'ls_character'    -- names and statics go on the documents
dependency 'phone_garage'    -- wallet and car ownership
dependency 'ls_inventory'    -- handing items over

ui_page 'html/index.html'

shared_script 'config.lua'
client_script 'client/main.lua'
server_script 'server/main.lua'

files {
    'html/index.html',
    'html/style.css',
    'html/app.js'
}
