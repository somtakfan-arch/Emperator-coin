fx_version 'cerulean'
game 'gta5'
lua54 'yes'

name 'ls_medical'
description 'Death and revival: lie down, hospital respawn, defibrillators, painkillers'
version '1.0.0'

dependency 'ls_inventory'
dependency 'ls_character'

shared_scripts {
    'config.lua',
    'locale.lua',
}

client_script 'client/main.lua'
server_script 'server/main.lua'
