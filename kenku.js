"use strict";

console.log("LOADING LIBRARIES...");

require("dotenv").config({path: "./kenku.env"});

const fs = require("fs");
const {
	Client,
	GatewayIntentBits,
	MessageType,
	ChannelType,
	Collection,
	ActivityType,
	SlashCommandBuilder,
	SlashCommandChannelOption,
	REST,
	Routes,
	Events,
	PermissionsBitField
} = require("discord.js");

const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.MessageContent,
		GatewayIntentBits.GuildWebhooks
]});

client.login(process.env.DISCORD_TOKEN).catch(console.error);

async function registerSlashCommands() {
	const rest = new REST().setToken(process.env.DISCORD_TOKEN);
	const commands = [
		new SlashCommandBuilder()
			.setName("help")
			.setDescription("Shows help for using this bot.").toJSON(),
		new SlashCommandBuilder()
			.setName("copy")
			.setDescription("Copies all messages from another channel.")
			.addSubcommand(subcommand =>
				subcommand
					.setName('channel')
					.setDescription('Copies all messages from one channel to another.')
					.addChannelOption(option =>
						option.setName("from")
							.setDescription("The channel to copy messages from.")
							.addChannelTypes(
								ChannelType.GuildText,
								ChannelType.PublicThread,
								ChannelType.PrivateThread
							))
					.addChannelOption(option =>
						option.setName("to")
							.setDescription("The channel to paste messages to.")
							.addChannelTypes(
								ChannelType.GuildText,
								ChannelType.PublicThread,
								ChannelType.PrivateThread
							))
			).addSubcommand(subcommand =>
				subcommand
					.setName('message')
					.setDescription('Copies a single message.')
					.addStringOption(option =>
						option.setName("link")
							.setDescription("The URL of the message to copy.")
							.setRequired(true))
					.addChannelOption(option =>
						option.setName("to")
							.setDescription("The channel to paste the message in.")
							.addChannelTypes(
								ChannelType.GuildText,
								ChannelType.PublicThread,
								ChannelType.PrivateThread
							))
			).toJSON(),
		new SlashCommandBuilder()
			.setName("stop")
			.setDescription("Stops copying messages.")
			.addChannelOption(option =>
				option.setName("channel")
					.setDescription("The channel to stop pasting messages into.")
					.addChannelTypes(
						ChannelType.GuildText,
						ChannelType.PublicThread,
						ChannelType.PrivateThread
					)).toJSON()
	];
	await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), {body: commands});
}


client.on("ready", async function() {
	client.user.setActivity({name: "D&D with Avrae", type: ActivityType.Playing});
	// await registerSlashCommands(); // Uncomment if anything changes.
	console.log("READY FOR ACTION!");
});

const activeChannels = {};

function capitalizeFirst(str) {
	return str.charAt(0).toUpperCase() + str.slice(1);
}

async function send(webhook, channel, content, reactions) {
	if (webhook && channel.isThread()) {
		if (typeof content === 'string') {
			content = {content: content, threadId: channel.id};
		} else {
			content.threadId = channel.id;
		}
	}
	content.allowedMentions = {parse: []};
	const sent = await (webhook || channel).send(content).catch(console.error);
	if (reactions.size) {
		for (const reaction of reactions.values()) {
			const emoji = reaction.emoji;
			if (client.emojis.cache.has(emoji.id) || emoji.id === null) {
				await sent.react(emoji).catch(console.error);
			}
		}
	}
}

const systemMessages = {
	[MessageType.AutoModerationAction]: "did an AutoModerationAction.",
	[MessageType.Call]: "started a call.",
	[MessageType.ChannelFollowAdd]: "did a ChannelFollowAdd.",
	[MessageType.ChannelIconChange]: "changed the icon of this channel.",
	[MessageType.ChannelNameChange]: "changed the name of this channel.",
	[MessageType.ChannelPinnedMessage]: "pinned a message to this channel.",
	[MessageType.ContextMenuCommand]: "did a ContextMenuCommand.",
	[MessageType.GuildApplicationPremiumSubscription]: "did a GuildApplicationPremiumSubscription.",
	[MessageType.GuildBoost]: "did a GuildBoost.",
	[MessageType.GuildBoostTier1]: "did a GuildBoostTier1.",
	[MessageType.GuildBoostTier2]: "did a GuildBoostTier2.",
	[MessageType.GuildBoostTier3]: "did a GuildBoostTier3.",
	[MessageType.GuildDiscoveryDisqualified]: "did a GuildDiscoveryDisqualified.",
	[MessageType.GuildDiscoveryGracePeriodFinalWarning]: "did a GuildDiscoveryGracePeriodFinalWarning.",
	[MessageType.GuildDiscoveryGracePeriodInitialWarning]: "did a GuildDiscoveryGracePeriodInitialWarning.",
	[MessageType.GuildDiscoveryRequalified]: "did a GuildDiscoveryRequalified.",
	[MessageType.GuildInviteReminder]: "did a GuildInviteReminder.",
	[MessageType.InteractionPremiumUpsell]: "did a InteractionPremiumUpsell.",
	[MessageType.RecipientAdd]: "added someone to the group.",
	[MessageType.RecipientRemove]: "removed someone from the group.",
	[MessageType.RoleSubscriptionPurchase]: "did a RoleSubscriptionPurchase.",
	[MessageType.StageEnd]: "did a StageEnd.",
	[MessageType.StageRaiseHand]: "did a StageRaiseHand.",
	[MessageType.StageSpeaker]: "did a StageSpeaker.",
	[MessageType.StageStart]: "did a StageStart.",
	[MessageType.StageTopic]: "did a StageTopic.",
	[MessageType.ThreadCreated]: "created a Thread.",
	[MessageType.UserJoin]: "just joined.",
};

const normalMessages = [
	MessageType.Default,
	MessageType.Reply,
	MessageType.ChatInputCommand
];

async function updateWebhook(webhook, message) {
	if (!webhook) return false;
	try {
		await webhook.edit({
			name: message.author.username,
			avatar: message.author.displayAvatarURL()
		});
	} catch (err) {
		console.error(err);
		return false;
	}
	return true;
}

async function sendMessage(message, from, to, webhook, lastAuthor) {
	// Let's check our copying hasn't been /stop.
	if (activeChannels[to.id] !== from.id) return false;

	if (systemMessages[message.type] !== undefined) {
		await to.send(
			`**${message.author.username} ${systemMessages[message.type]}**`
		).catch(console.error);
		return true;
	} else if (message.type === MessageType.ThreadStarterMessage) {
		const starterMessage = await message.channel.fetchStarterMessage();
		await sendMessage(starterMessage, from, to, webhook, lastAuthor);
	} else if (normalMessages.indexOf(message.type) === -1) {
		console.log(`Unknown message type encountered: ${message.type}`);
		await to.send(
			`**${message.author.username} sent an unknown type of message (${message.type})**`
		).catch(console.error);
		return true;
	}
	if (message.author.username !== lastAuthor) {
		let webhookUpdated = await updateWebhook(webhook, message);
		// Webhook edits can take ages so let's double check our copying hasn't been /stop.
		if (activeChannels[to.id] !== from.id) return false;
		if (!webhookUpdated) {
			await to.send(`**${message.author.username}**`).catch(console.error);
		}
	}
	const out = {};
	const bigFiles = [];
	let notEmpty = false;
	if (message.content) {
		out.content = message.content
		notEmpty = true;
	}
	if (message.attachments.size) {
		console.log(message.attachments);
		out.files = [];
		for (const attachment of message.attachments.values()) {
			if (attachment.filesize > 8000000) {
				bigFiles.push(attachment.url);
			} else {
				out.files.push(attachment.url);
				notEmpty = true;
			}
		}
	}
	if (message.embeds.length) {
		out.embeds = [];
		for (const embed of message.embeds) {
			if (embed.data.type === "rich") {
				out.embeds.push(embed);
				notEmpty = true;
			} else {
				console.log(`Weird embed type: ${embed.data.type}\nMsg: ${message.url}`);
			}
		}
	}
	if (notEmpty) {
		await send(webhook, to, out, message.reactions);
	}
	for (const bigFile of bigFiles) {
		await send(webhook, to, bigFile, message.reactions);
	}
	return true;
}

async function fetchMessages(from, to, webhook, interaction) {
	let messages = new Collection();
	let messageBatch = await from.messages.fetch({limit: 100}).catch(async function() {
		await reply(interaction, "Failed to fetch messages!");
	});
	while (messageBatch && messageBatch.size > 0) {
		if (activeChannels[to.id] !== from.id) return false;
		to.sendTyping();
		messages = messages.concat(messageBatch);
		messageBatch = await from.messages.fetch({
			limit: 100,
			before: messageBatch.last().id,
		}).catch(async function() {
			await reply(interaction, "Failed to fetch messages!");
		});
	}
	let lastAuthor = null;
	if (messages && messages.size) {
		for (const message of [...messages.values()].reverse()) {
			if (!await sendMessage(message, from, to, webhook, lastAuthor)) return false;
			lastAuthor = message.author.username;
		}
	}
	return true;
}

async function fetchWebhook(channel, interaction) {
	const webhookChannel = channel.isThread() ? channel.parent : channel
	const webhooks = await webhookChannel.fetchWebhooks().catch(async function() {
		await reply(interaction, "Failed to read webhooks!");
	});
	if (webhooks) {
		for (const webhook of webhooks.values()) {
			if (webhook.owner.id === client.user.id) {
				return webhook;
			}
		}
	}
	return webhookChannel.createWebhook({
		name: "Kenku Beak",
		avatar: client.user.displayAvatarURL(),
		reason: "Reposting"
	}).catch(console.error);
}

const validChannelTypes = [
	ChannelType.GuildText,
	ChannelType.PublicThread,
	ChannelType.PrivateThread
];

async function reply(interaction, content) {
	return await interaction.reply({content: content, ephemeral: true}).catch(async function() {
		await interaction.channel.send(content).catch(console.error);
	});
}

async function followUp(interaction, content) {
	return await interaction.followUp({content: content, ephemeral: true}).catch(async function() {
		await interaction.channel.send(content).catch(console.error);
	});
}

client.on(Events.InteractionCreate, async interaction => {
	if (!interaction.isChatInputCommand()) return;

	switch (interaction.commandName) {
		case "help":
			await reply(interaction, "I can help you!");
			break;
		case "copy":
			let to = interaction.options.getChannel("to") || interaction.channel;
			let from;
			switch (interaction.options.getSubcommand()) {
				case "channel":
					from = interaction.options.getChannel("from") || interaction.channel;
					if (from.id === to.id) {
						await reply(interaction, "I can't paste in the same channel I'm copying from!");
					} else if (validChannelTypes.indexOf(from.type) === -1) {
						await reply(interaction, "I can only copy from text-based server channels!");
					} else if (validChannelTypes.indexOf(to.type) === -1) {
						await reply(interaction, "I can only paste in text-based server channels!");
					} else if (!to.permissionsFor(client.user).has(to.isThread() ? PermissionsBitField.Flags.SendMessagesInThreads : PermissionsBitField.Flags.SendMessages)) {
						await reply(interaction, `I haven't got permission to post in <#${to.id}>!`);
					} else if (activeChannels[to.id] !== undefined) {
						await reply(interaction, `I'm already pasting into <#${to.id}> from <#${activeChannels[to.id]}>!`);
					} else {
						await reply(interaction, `Okay, I'll copy messages from <#${from.id}> to <#${to.id}>...`);
						activeChannels[to.id] = from.id;
						const hook = await fetchWebhook(to, interaction).catch(console.error);
						if (await fetchMessages(from, to, hook, interaction)) {
							followUp(interaction, "I've finished copying!");
						} else {
							followUp(interaction, "I've aborted copying!");
						}
						delete activeChannels[to.id];
					}
					break;
				case "message":
					if (validChannelTypes.indexOf(to.type) === -1) {
						await reply(interaction, "I can only paste in text-based server channels!");
					} else if (!to.permissionsFor(client.user).has(to.isThread() ? PermissionsBitField.Flags.SendMessagesInThreads : PermissionsBitField.Flags.SendMessages)) {
						await reply(interaction, `I haven't got permission to post in <#${to.id}>!`);
					} else if (activeChannels[to.id] !== undefined) {
						await reply(interaction, `I'm already pasting into <#${to.id}> from <#${activeChannels[to.id]}>!`);
					} else {
						let message_url = interaction.options.getString("link");
						let regex = /https?:\/\/(?:www\.)?discord\.com\/channels\/(?:[0-9]+)\/([0-9]+)\/([0-9]+)/gi;
						let matches = [...message_url.matchAll(regex)];
						if (matches.length !== 1 && matches[0].length !== 3) {
							await reply(interaction, `${message_url} is not a valid message link.`);
						} else {
							await reply(interaction, "Okay, I'll copy that message!")
							let channel_id = matches[0][1];
							let message_id = matches[0][2];
							try {
								from = await client.channels.fetch(channel_id);
								let message = await from.messages.fetch(message_id);
								const hook = await fetchWebhook(to, interaction);
								activeChannels[to.id] = from.id;
								await sendMessage(message, from, to, hook, null);
								followUp(interaction, "I've finished copying that message!");
							} catch (err) {
								console.error(err);
								followUp(interaction, "I've failed to copy that message...");
							}
							delete activeChannels[to.id];
						}
					}
					break;
			}
			break;
		case "stop":
			let channel = interaction.options.getChannel("channel") || interaction.channel;
			delete activeChannels[channel.id];
			await reply(interaction, `Okay, I'll stop pasting into <#${channel.id}>!`);
			break;
		default:
			console.error(`No command matching ${interaction.commandName} was found.`);
			return;
	}
});
