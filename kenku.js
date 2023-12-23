"use strict";

console.log("LOADING LIBRARIES...");

require("dotenv").config({path: "./kenku.env"});

const fs = require("fs");
const {
	Client,
	GatewayIntentBits,
	MessageType,
	ChannelType,
	EmbedBuilder,
	Collection,
	ActivityType,
	SlashCommandBuilder,
	SlashCommandChannelOption,
	REST,
	Routes,
	Events
} = require("discord.js");

const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.MessageContent,
		GatewayIntentBits.GuildWebhooks
]});

client.login(process.env.DISCORD_TOKEN).catch(console.error);

// Construct and prepare an instance of the REST module
const rest = new REST().setToken(process.env.DISCORD_TOKEN);

const commands = [];

commands.push(new SlashCommandBuilder()
	.setName("help")
	.setDescription("Shows help for using this bot.").toJSON());

commands.push(new SlashCommandBuilder()
	.setName("copy")
	.setDescription("Copies all messages from another channel.")
	.addChannelOption(option =>
		option.setName("from")
			.setDescription("The channel to copy messages from.")
			.setRequired(true)
			.addChannelTypes(
				ChannelType.GuildText,
				ChannelType.PublicThread,
				ChannelType.PrivateThread
			)).toJSON());

commands.push(new SlashCommandBuilder()
	.setName("stop")
	.setDescription("Stops copying messages.").toJSON());

rest.put(
	Routes.applicationCommands(process.env.CLIENT_ID),
	{ body: commands },
);

client.on("ready", function() {
	client.user.setActivity({name: "D&D with Avrae", type: ActivityType.Playing});
	console.log("READY FOR ACTION!");
});

let config = {
	prefixes: {},
	active: {}
};

function updateJson() {
	fs.writeFileSync("config.json", JSON.stringify(config, undefined, "\t"));
}

if (fs.existsSync("config.json")) {
	config = JSON.parse(fs.readFileSync("config.json", "utf8"));
} else {
	updateJson();
}

function capitalizeFirst(str) {
	return str.charAt(0).toUpperCase() + str.slice(1);
}

function inactive(to, from) {
	return from ? !config.active[from] : !config.active[to];
}

async function send(webhook, channel, content, reactions) {
	if (inactive(channel.id)) return;
	if (webhook && channel.isThread()) {
		const sent = await webhook.send({content: content, threadId: channel.id}).catch(console.error);
	} else {
		const sent = await (webhook || channel).send(content).catch(console.error);
	}
	if (reactions.size) {
		for (const reaction of reactions.values()) {
			if (inactive(channel.id)) break;
			const emoji = reaction.emoji;
			if (client.emojis.cache.has(emoji.id) || emoji.id === null) {
				await sent.react(emoji).catch(console.error);
			}
		}
	}
}

function niceName(to, from, user) {
	const guild = (to.guild || to).id;
	if (config.nicknames[guild] && from.guild) {
		const member = from.guild.member(user);
		if (member) {
			return member.displayName;
		} else if (config.tags[guild]) {
			return user.tag;
		} else {
			user.username;
		}
	} else if (config.tags[guild]) {
		return user.tag;
	} else {
		return user.username;
	}
}

const systemMessages = {
	RECIPIENT_ADD: " added someone to the group.",
	RECIPIENT_REMOVE: " removed someone from the group.",
	CALL: " started a call.",
	CHANNEL_NAME_CHANGE: " changed the name of this channel.",
	CHANNEL_ICON_CHANGE: " changed the icon of this channel.",
	PINS_ADD: " pinned a message to this channel.",
	GUILD_MEMBER_JOIN: " just joined."
};

async function sendMessage(message, channel, webhook, author) {
	if (inactive(channel.id, message.channel.id)) return;
	if (message.type !== MessageType.Default) {
		await channel.send(`**${niceName(channel, message.channel, message.author)}${systemMessages[message.type]}**`).catch(console.error);
	} else if (message.author.username !== author) {
		if (webhook) {
			await webhook.edit({name: niceName(channel, message.channel, message.author), avatar: message.author.displayAvatarURL()}).catch(console.error);
		} else {
			await channel.send(`**${niceName(channel, message.channel, message.author)}**`).catch(console.error);
		}
	}
	if (message.content) {
		await send(webhook, channel, message.content, message.reactions);
	}
	if (message.attachments.size) {
		for (const attachment of message.attachments.values()) {
			await send(webhook, channel, attachment.filesize > 8000000 ? attachment.url : { files: [attachment.url] }, message.reactions);
		}
	}
	if (message.embeds.length) {
		for (let i = 0; i < message.embeds.length; i++) {
			const embed = message.embeds[i];
			if (embed.type === "rich") {
				await send(webhook, channel, embed, channel, message.reactions);
			}
		}
	}
}

async function sendMessages(messages, channel, webhook, author) {
	if (inactive(channel.id)) return;
	let last;
	if (messages && messages.size) {
		const backward = [...messages.values()].reverse();
		for (let i = 0; i < backward.length; i++) {
			if (inactive(channel.id, backward[i].channel.id)) break;
			await sendMessage(backward[i], channel, webhook, last ? last.author.username : author);
			last = backward[i];
		}
	}
}

async function fetchMessages(from, to, webhook) {
	let messages = new Collection();
	let messageBatch = await from.messages.fetch({limit: 100}).catch(async function() {
		await to.send("**Couldn't fetch messages!**").catch(console.error);
	});
	while (messageBatch && messageBatch.size > 0) {
		if (inactive(to.id, from.id)) return;
		messages = messages.concat(messageBatch);
		console.log("Messages fetched: " + messages.size)
		messageBatch = await from.messages.fetch({
			limit: 100,
			before: messageBatch.last().id,
		}).catch(async function() {
			await to.send("**Couldn't fetch messages!**").catch(console.error);
		});
	}
	console.log("Finished fetching, sending messages now")
	await sendMessages(messages, to, webhook, null);
	console.log("Finished sending messages")
}

async function fetchWebhook(channel) {
	const webhookChannel = channel.isThread() ? channel.parent : channel
	const webhooks = await webhookChannel.fetchWebhooks().catch(async function() {
		await channel.send("**Can't read webhooks!**").catch(console.error);
	});
	if (webhooks) {
		for (const webhook of webhooks.values()) {
			if (webhook.owner.id === client.user.id) {
				return webhook;
			}
		}
		return webhookChannel.createWebhook({
			name: "Kenku Beak",
			avatar: client.user.displayAvatarURL(),
			reason: "Reposting"
		}).catch(console.error);
	}
}

async function repost(id, message, webhook, direction, live) {
	const channel = (id && id.id) ? id : await client.channels.fetch(id).catch(() => null);
	const dir = direction ? "from" : "to";
	if (!channel) {
		const guild = await client.guilds.fetch(id).catch(() => null);
		if (guild) {
			config.active[message.channel.id] = true;
			await message.channel.send(`**Reposting${dir} \`${guild.name || id}\`!**`).catch(console.error);
			for (const match of guild.channels.cache.values()) {
				if (inactive(message.channel.id)) break;
				config.active[match.id] = true;
				updateJson();
				await repost(match, message, webhook, direction, live);
			}
		} else if (message.mentions.channels.size) {
			await repost(message.mentions.channels.first(), message, webhook, direction, live);
		} else {
			const matches = [];
			for (const match of client.channels.cache.values()) {
				if (id === match.name) {
					matches.push(match);
				}
			}
			if (matches.length) {
				if (matches.length === 1) {
					await repost(matches[0], message, webhook, direction, live);
				} else {
					await message.channel.send(`**Found ${matches.length} channels!**`).catch(console.error);
					for (let i = 0; i < matches.length; i++) {
						const match = matches[i];
						const rich = new EmbedBuilder();
						rich.setFooter({text: `${capitalizeFirst(match.type)} Channel`, iconURL: client.user.displayAvatarURL()});
						if (match.guild) {
							rich.setAuthor({name: match.name, iconURL: match.guild.iconURL()});
						} else if (match.recipient) {
							rich.setAuthor({name: niceName(message.channel, match, match.recipient), iconURL: match.recipient.displayAvatarURL()});
						} else {
							rich.setAuthor({name: match.name, iconURL: match.iconURL()});
						}
						rich.setTimestamp(match.createdAt);
						rich.addFields({name: "Channel ID", value: `\`${match.id}\``, inline: false});
						const embed = await message.channel.send(rich).catch(console.error);
						await embed.react("✅").catch(console.error);
						embed.awaitReactions((reaction, user) => user.id === message.author.id && reaction.emoji.name === "✅", { max: 1 }).then(async function() {
							await repost(match, message, webhook, direction, live);
						});
					}
				}
			} else {
				await message.channel.send(`**Couldn't repost ${dir} \`${id}\`!**`).catch(console.error);
			}
		}
	} else if (channel.id === message.channel.id) {
		await message.channel.send(`**Can't repost ${dir} the same channel!**`).catch(console.error);
	//} else if ([ChannelType.GuildText, ChannelType.PublicThread, ChannelType.PrivateThread].indexOf(channel.type) !== -1) {
	//	await message.channel.send(`**Can't repost ${dir} ${channel.type} channels!**`).catch(console.error);
	} else if (webhook && (direction ? message.channel.type : channel.type) === "dm") {
		await message.channel.send("**Can't create webhooks on DM channels!**").catch(console.error);
	} else if (channel.type === "text" && !direction && !channel.permissionsFor(client.user).has("SEND_MESSAGES")) {
		await message.channel.send(`**Can't repost to \`${channel.name || id}\` without permission!**`).catch(console.error);
	} else {
		const to = direction ? message.channel : channel;
		const from = direction ? channel : message.channel;
		config.active[to.id] = true;
		config.active[from.id] = true;
		updateJson();
		if (live) {
			config.live[from.id] = { channel: to.id, hook: webhook };
			updateJson();
		} else {
			if (inactive(to.id, from.id)) return;
			const hook = webhook && await fetchWebhook(to);
			await fetchMessages(from, to, hook)
		}
	}
}

function sendCommands(channel) {
	const prefix = config.prefixes[(channel.guild || channel).id] || "£";
	const rich = new EmbedBuilder();
	rich.setTitle("Kenku Commands");
	rich.setDescription("By MysteryPancake");
	rich.setFooter({text: client.user.id, iconURL: client.user.displayAvatarURL()});
	rich.setAuthor({name: niceName(channel, channel, client.user), iconURL: client.user.displayAvatarURL(), url: "https://github.com/MysteryPancake/Discord-Reposter"});
	rich.setThumbnail(client.user.displayAvatarURL());
	rich.setTimestamp();
	rich.setURL("https://github.com/Lathaon/Kenku#commands");
	rich.addFields(
		{name: "Repost To", value: `*Reposts to a channel.*\`\`\`${prefix}repost <CHANNEL>\n${prefix}repost to <CHANNEL>\`\`\``, inline: false},
		{name: "Repost From", value: `*Reposts from a channel.*\`\`\`${prefix}repost from <CHANNEL>\`\`\``, inline: false},
		{name: "Repost Webhook", value: `*Reposts through a webhook.*\`\`\`${prefix}reposthook\n${prefix}repostwebhook\`\`\`Instead of:\`\`\`${prefix}repost\`\`\``, inline: false},
		{name: "Repost Stop", value: `*Stops reposting.*\`\`\`${prefix}repost stop\n${prefix}repost halt\n${prefix}repost cease\n${prefix}repost terminate\n${prefix}repost suspend\n${prefix}repost cancel\n${prefix}repost die\n${prefix}repost end\`\`\``, inline: false},
		{name: "Repost Commands", value: `*Posts the command list.*\`\`\`${prefix}repost help\n${prefix}repost commands\`\`\``, inline: false},
		{name: "Channel ID", value: `\`\`\`${channel.id}\`\`\``, inline: false}
	);
	channel.send(rich).catch(console.error);
}

/*
client.on("messageCreate", function(message) {
	if (message.author.bot) return;
	const args = message.content.toLowerCase().split(" ");
	const prefix = config.prefixes[(message.guild || message.channel).id] || ",";
	if (args[0].startsWith(`${prefix}repost`)) {
		switch (args[1]) {
		case undefined:
		case "help":
		case "commands":
			sendCommands(message.channel);
			break;
		case "stop":
		case "halt":
		case "cease":
		case "terminate":
		case "suspend":
		case "cancel":
		case "die":
		case "end":
			delete config.active[message.channel.id];
			updateJson();
			message.channel.send("**Reposting Terminated!**").catch(console.error);
			break;
		default:
			const last = args[2];
			if (last) {
				repost(last, message, args[0].indexOf("hook") !== -1, args[1] === "from", args[0].indexOf("live") !== -1);
			} else {
				repost(args[1], message, args[0].indexOf("hook") !== -1, false, args[0].indexOf("live") !== -1);
			}
			break;
		}
	}
});
*/

client.on(Events.InteractionCreate, async interaction => {
	if (!interaction.isChatInputCommand()) return;

	switch (interaction.commandName) {
		case "help":
			await interaction.reply({content: "I can help you!", ephemeral: true})
			//sendCommands(message.channel);
			break;
		case "copy":
			let from = interaction.options.getChannel("from", true)
			//let to = interaction.options.getChannel("to")
			await interaction.reply({content: `Okay, I'll copy messages from <#${from.id}>...`, ephemeral: true})
			await repost(from, interaction, true, true, false)
			await interaction.followUp({content: "I've finished copying!", ephemeral: true})
			break;
		case "stop":
			delete config.active[interaction.channel.id];
			updateJson();
			await interaction.reply({content: "Okay, I'll stop copying!", ephemeral: true})
			break;
		default:
			console.error(`No command matching ${interaction.commandName} was found.`);
			return;
	}
});
