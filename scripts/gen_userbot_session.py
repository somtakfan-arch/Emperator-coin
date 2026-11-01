#!/usr/bin/env python3
"""Generate a Telethon StringSession for the "eternal birthday" userbot.

Run this ON YOUR OWN COMPUTER (not on a server you don't control):

    pip install telethon
    python gen_userbot_session.py

It will ask for your api_id / api_hash (from https://my.telegram.org →
API development tools), then your phone number and the login code Telegram
sends you (and your 2FA password if you have one). It prints a SESSION string.

Put these THREE values into Railway → your service → Variables (never commit
them, never paste them in chat):

    TG_API_ID=<your api_id>
    TG_API_HASH=<your api_hash>
    USERBOT_SESSION=<the printed session string>

The session string = full access to your Telegram account. Keep it secret.
"""
from telethon import TelegramClient
from telethon.sessions import StringSession


def main() -> None:
    api_id = int(input("api_id: ").strip())
    api_hash = input("api_hash: ").strip()
    with TelegramClient(StringSession(), api_id, api_hash) as client:
        print("\n==== COPY THIS INTO Railway as USERBOT_SESSION ====\n")
        print(client.session.save())
        print("\n===================================================\n")
        me = client.get_me()
        print(f"Logged in as: {getattr(me, 'first_name', '')} (@{getattr(me, 'username', None)})")


if __name__ == "__main__":
    main()
