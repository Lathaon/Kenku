# Kenku
A Discord bot for copying all messages from one channel to another, using webhooks to imitate different users.

The original code included some other functionality (that I didn't care to maintain), but didn't support threads or slash commands.

## Commands
### Help
*At some point this will show some useful help, but for now it's just a placeholder.*

`/help`

### Copy
*Copies messages from one channel and pastes them in another. Defaults to the channel you enter the command in.*

`/copy from:<CHANNEL> to:<CHANNEL2>`

### Stop
*Stops pasting messages in a channel. Defaults to the channel you enter the command in.*

`/stop channel:<CHANNEL>`

## Setup
1. [Create your app with a Bot](https://discordapp.com/developers/applications/me).
2. Create a `kenku.env` file like this, filling in with your bot's details (don't share the token on GitHub!): ```
DISCORD_TOKEN=
CLIENT_ID=
```
3. Invite your bot using `https://discordapp.com/oauth2/authorize?client_id=<CLIENT_ID>&scope=bot`, with `<CLIENT_ID>` as your app's client ID.
4. [Install Node.js](https://nodejs.org/en/download): `brew install node`
5. [Install the dependencies](package.json#L36-L38): `npm install`
6. [Run the bot](kenku.js): `npm start`
7. Hope it works!
